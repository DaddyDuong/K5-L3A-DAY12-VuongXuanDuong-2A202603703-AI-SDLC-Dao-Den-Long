// Rendering + keyboard only. All gameplay lives in src/sim and is shared with the headless runner.
import * as THREE from "three";
import { distXZ, step } from "../sim/step.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import { DEFAULT_INPUT, type InputState, type SimEvent, type World } from "../sim/types.js";
import { createWorld, timeLeftS } from "../sim/world.js";
import { InputTimeline, parseInputs, type InputFrame } from "../sim/inputs.js";

// Replay mode: ?seed=N&replay=<inputs.json>[&speed=K] plays a contract inputs file through the same step().
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const replayUrl = params.get("replay");
const speed = Math.max(0.25, Number(params.get("speed") ?? "1") || 1);
let replayFrames: InputFrame[] | null = null;
let timeline: InputTimeline | null = null;
let endReason = "";

const COLORS = { warm: 0xffa040, danger: 0x3a1450, island: 0x2d3b2a, sky: 0x0b0614 };

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.danger, 15, 70);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
const ambient = new THREE.HemisphereLight(0x6a4c9c, 0x10081a, 0.6);
scene.add(ambient);
const fogDark = new THREE.Color(COLORS.danger);
const fogWarm = new THREE.Color(0x6a4a3a);

// Pulse effect: a warm ring that expands to pulse_radius and fades.
const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 48),
  new THREE.MeshBasicMaterial({ color: COLORS.warm, transparent: true, opacity: 0, side: THREE.DoubleSide }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseFxStart = -1;
let hitFxStart = -1;

const island = new THREE.Mesh(
  new THREE.CylinderGeometry(WORLD.island_radius, WORLD.island_radius * 0.8, 3, 64),
  new THREE.MeshStandardMaterial({ color: COLORS.island }),
);
island.position.y = -1.5;
scene.add(island);

// Player "Mây": warm tunic, head, wide straw conical hat (nón lá), paper lantern hanging from the brim.
// Materials get a little self-glow so the silhouette reads in the dark night.
const glowMat = (color: number, emissive: number, emissiveIntensity: number) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity });
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 12), glowMat(0xb5523b, 0x5a1e14, 0.5));
body.position.y = 0.6;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), glowMat(0xf2c9a0, 0x6b4a30, 0.45));
head.position.y = 1.28;
const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.42, 32), glowMat(0xf0dc9c, 0x8a7238, 0.7));
hat.position.y = 1.62;
// Lantern pivot hangs under the right edge of the brim (local -X is screen-right from the
// chase camera) so it stays visible, and swings while walking.
const lanternPivot = new THREE.Group();
lanternPivot.position.set(-0.68, 1.5, -0.05);
const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
cord.position.y = -0.15;
const paperLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), glowMat(0xff6a30, 0xff5a20, 2.2));
paperLantern.position.y = -0.41;
const capMat = new THREE.MeshStandardMaterial({ color: 0xd4a640 });
const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), capMat);
capTop.position.y = -0.29;
const capBottom = capTop.clone();
capBottom.position.y = -0.53;
const playerLight = new THREE.PointLight(COLORS.warm, 10, 11);
playerLight.position.y = -0.41;
lanternPivot.add(cord, paperLantern, capTop, capBottom, playerLight);
player.add(body, head, hat, lanternPivot);
scene.add(player);
let lastPlayerPos = new THREE.Vector3();

const moteGeo = new THREE.SphereGeometry(0.15, 10, 8);
const moteMat = new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffe066, emissiveIntensity: 3 });
const shadeGeo = new THREE.SphereGeometry(0.7, 16, 12);
const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1a0624, emissive: 0x5a1a80, emissiveIntensity: 0.6 });
const shadeStunMat = new THREE.MeshStandardMaterial({ color: 0x6a5a80, transparent: true, opacity: 0.5 });

interface LanternView { lamp: THREE.Mesh; light: THREE.PointLight; group: THREE.Group; safeRing: THREE.Mesh }
let lanternViews = new Map<string, LanternView>();
const moteViews = new Map<string, THREE.Mesh>();
const shadeViews = new Map<string, THREE.Mesh>();

function buildLanterns(w: World) {
  for (const v of lanternViews.values()) scene.remove(v.group);
  lanternViews = new Map();
  for (const l of w.lanterns) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3, 8), glowMat(0x9a6a44, 0x3a2414, 0.6));
    pole.position.y = 1.5;
    // Big paper lantern: dimly glowing when unlit so it can be found from afar, bright when lit.
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16), glowMat(0xc8603a, 0xff8a40, 0.3));
    lamp.position.y = 3.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.35, 16), glowMat(0x5a3020, 0x2a1408, 0.6));
    roof.position.y = 4.12;
    const light = new THREE.PointLight(COLORS.warm, 0, 18);
    light.position.y = 3.5;
    // Base marker (always) + safe-zone ring (only when lit: unlit lanterns do not protect, R6).
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.25, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.03;
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.12, TUNING.safe_radius, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.warm, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.04;
    safeRing.visible = false;
    group.add(pole, lamp, roof, light, marker, safeRing);
    group.position.set(...l.pos);
    scene.add(group);
    lanternViews.set(l.id, { lamp, light, group, safeRing });
  }
}

function syncMap<T extends { id: string; pos: [number, number, number] }>(
  items: T[], views: Map<string, THREE.Mesh>, make: () => THREE.Mesh, update: (m: THREE.Mesh, it: T) => void,
) {
  const alive = new Set(items.map((i) => i.id));
  for (const [id, m] of views) if (!alive.has(id)) { scene.remove(m); views.delete(id); }
  for (const it of items) {
    let m = views.get(it.id);
    if (!m) { m = make(); scene.add(m); views.set(it.id, m); }
    update(m, it);
  }
}

// ---------- input ----------
const keys = new Set<string>();
let camYawDeg = 0;
addEventListener("keydown", (e) => { keys.add(e.code); if (e.code === "KeyR") restart(); });
addEventListener("keyup", (e) => keys.delete(e.code));
renderer.domElement.addEventListener("click", () => renderer.domElement.requestPointerLock());
addEventListener("mousemove", (e) => { if (document.pointerLockElement) camYawDeg -= e.movementX * 0.25; });

function readInput(): InputState {
  // Camera faces +Z at yaw 0, so screen-right is -X: D maps to x = -1 (see contract §C rotation).
  const x = (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0);
  const z = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  if (keys.has("ArrowLeft")) camYawDeg += 2;
  if (keys.has("ArrowRight")) camYawDeg -= 2;
  return {
    ...DEFAULT_INPUT,
    move: [x, z],
    cam_yaw_deg: camYawDeg,
    jump: keys.has("Space"),
    interact: keys.has("KeyE"),
    pulse: keys.has("KeyF"),
  };
}

// ---------- game loop (fixed 60 Hz, same step() as headless) ----------
let world: World;
let seed = 0;
function restart() {
  seed = seedParam !== null ? Number(seedParam) : (Date.now() & 0x7fffffff) >>> 0;
  world = createWorld(seed);
  buildLanterns(world);
  timeline = replayFrames ? new InputTimeline(replayFrames) : null;
  endReason = "";
}
restart();
if (replayUrl) {
  fetch(replayUrl)
    .then((r) => r.json())
    .then((j) => { replayFrames = parseInputs(j); restart(); })
    .catch((e) => console.error("replay load failed", e));
}

function nextInput(): InputState {
  if (!timeline) return readInput();
  const input = timeline.at(world.steps);
  camYawDeg = input.cam_yaw_deg;
  return input;
}

const hud = document.getElementById("hud")!;
const overlay = document.getElementById("overlay")!;
const DT = 1 / WORLD.tick_rate;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000) * speed;
  last = now;
  while (acc >= DT) { onEvents(step(world, nextInput()), now / 1000); acc -= DT; }
  render(now / 1000);
  requestAnimationFrame(frame);
}

function onEvents(events: SimEvent[], t: number) {
  for (const e of events) {
    if (e.name === "pulse") pulseFxStart = t;
    if (e.name === "player_hit") hitFxStart = t;
    if (e.name === "game_over") endReason = REASONS[e.data.reason as string] ?? "";
  }
}

const REASONS: Record<string, string> = {
  all_lit: "Cả 5 Đèn Lồng Lớn đã sáng.",
  no_flames: "Mây đã hết lửa.",
  dawn: "Trời đã sáng mà đảo vẫn chưa sáng đèn.",
};

function render(t: number) {
  const w = world;
  player.position.set(...w.player.pos);
  // Blink while invulnerable after a hit.
  player.visible = w.steps >= w.invulnUntil || Math.floor(t * 10) % 2 === 0;
  const yaw = (camYawDeg * Math.PI) / 180;
  player.rotation.y = yaw;
  // Lantern sways: gentle idle bob, stronger swing while moving.
  const moved = lastPlayerPos.distanceTo(player.position);
  lastPlayerPos = player.position.clone();
  const swing = Math.min(1, moved / 0.1);
  lanternPivot.rotation.x = (0.05 + 0.3 * swing) * Math.sin(t * 7);
  lanternPivot.rotation.z = 0.04 * Math.sin(t * 2.3);
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-8);
  camera.position.set(w.player.pos[0] + back.x, w.player.pos[1] + 3.2, w.player.pos[2] + back.z);
  camera.lookAt(w.player.pos[0], w.player.pos[1] + 1.4, w.player.pos[2]);

  let lit = 0;
  for (const l of w.lanterns) {
    const v = lanternViews.get(l.id)!;
    const mat = v.lamp.material as THREE.MeshStandardMaterial;
    if (l.lit) lit++;
    // Glow grows with the deposited amount; full light once lit.
    const fill = Math.min(1, l.deposited / TUNING.lantern_cost);
    mat.emissive.setHex(COLORS.warm);
    mat.emissiveIntensity = l.lit ? 2.5 : 0.3 + 0.7 * fill;
    v.light.intensity = l.lit ? 40 : 4 * fill;
    v.safeRing.visible = l.lit;
  }
  // The island brightens as lanterns are lit.
  const k = lit / w.lanterns.length;
  ambient.intensity = 0.6 + 1.2 * k;
  (scene.fog as THREE.Fog).color.copy(fogDark).lerp(fogWarm, k);
  (scene.background as THREE.Color).copy(new THREE.Color(COLORS.sky)).lerp(new THREE.Color(0x2a1a30), k);

  // Pulse ring + hit flash.
  const pa = pulseFxStart < 0 ? 1 : (t - pulseFxStart) / 0.4;
  const pm = pulseRing.material as THREE.MeshBasicMaterial;
  pm.opacity = pa < 1 ? 0.8 * (1 - pa) : 0;
  const ringR = Math.max(0.01, TUNING.pulse_radius * Math.min(1, pa));
  pulseRing.scale.set(ringR, ringR, 1);
  pulseRing.position.set(w.player.pos[0], 0.05, w.player.pos[2]);
  const hitA = hitFxStart < 0 ? 1 : (t - hitFxStart) / 0.3;
  document.body.style.boxShadow = hitA < 1 ? `inset 0 0 120px rgba(150,40,200,${0.8 * (1 - hitA)})` : "none";

  const nearLantern = w.lanterns.some((l) => !l.lit && distXZ(w.player.pos, l.pos) <= TUNING.interact_radius);
  const pulseReady = w.steps >= w.pulseReadyAt && w.player.carried >= TUNING.pulse_cost;
  syncMap(w.motes, moteViews, () => new THREE.Mesh(moteGeo, moteMat), (m, it) =>
    m.position.set(it.pos[0], 0.6 + 0.15 * Math.sin(t * 3 + it.pos[0]), it.pos[2]));
  syncMap(w.shades, shadeViews, () => new THREE.Mesh(shadeGeo, shadeMat), (m, it) => {
    m.position.set(...it.pos);
    m.material = it.state === "stunned" ? shadeStunMat : shadeMat;
  });

  hud.innerHTML =
    `Thời gian: ${timeLeftS(w).toFixed(0)}s · Điểm: ${w.score}<br>` +
    `Lửa: ${"♥".repeat(w.player.flames)} · Đom đóm: ${w.player.carried}/${TUNING.carry_capacity}<br>` +
    `Đèn: ${lit}/${w.lanterns.length} · Tỏa sáng (F): ${pulseReady ? "sẵn sàng" : "chưa"}` +
    (nearLantern && w.player.carried > 0 ? `<br><b>Nhấn E để nạp đèn</b>` : "") +
    `<br><small>seed ${seed}${timeline ? ` · REPLAY ×${speed}` : ""}</small>`;
  overlay.innerHTML = w.state === "playing" ? "" :
    `<h1>${w.state === "won" ? "Đảo đã sáng lại!" : "Bóng tối thắng đêm nay"}</h1>` +
    `<div>${endReason}</div><div>Điểm: ${w.score} · Nhấn R để chơi lại</div>`;

  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
requestAnimationFrame(frame);
