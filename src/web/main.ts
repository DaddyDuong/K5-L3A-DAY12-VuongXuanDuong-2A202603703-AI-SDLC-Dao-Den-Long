// Rendering + keyboard only. All gameplay lives in src/sim and is shared with the headless runner.
import * as THREE from "three";
import { step } from "../sim/step.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import { DEFAULT_INPUT, type InputState, type World } from "../sim/types.js";
import { createWorld, timeLeftS } from "../sim/world.js";

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
scene.add(new THREE.HemisphereLight(0x6a4c9c, 0x10081a, 0.6));

const island = new THREE.Mesh(
  new THREE.CylinderGeometry(WORLD.island_radius, WORLD.island_radius * 0.8, 3, 64),
  new THREE.MeshStandardMaterial({ color: COLORS.island }),
);
island.position.y = -1.5;
scene.add(island);

// Player: body + conical hat (nón lá) + small lantern.
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: 0x5b8fd6 }));
body.position.y = 0.75;
const hat = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0xe8d29a }));
hat.position.y = 1.65;
const handLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 12, 8),
  new THREE.MeshStandardMaterial({ color: COLORS.warm, emissive: COLORS.warm, emissiveIntensity: 2 }),
);
handLamp.position.set(0.5, 1.5, 0);
const playerLight = new THREE.PointLight(COLORS.warm, 8, 10);
playerLight.position.set(0, 1.6, 0);
player.add(body, hat, handLamp, playerLight);
scene.add(player);

const moteGeo = new THREE.SphereGeometry(0.15, 10, 8);
const moteMat = new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffe066, emissiveIntensity: 3 });
const shadeGeo = new THREE.SphereGeometry(0.7, 16, 12);
const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1a0624, emissive: 0x5a1a80, emissiveIntensity: 0.6 });
const shadeStunMat = new THREE.MeshStandardMaterial({ color: 0x6a5a80, transparent: true, opacity: 0.5 });

interface LanternView { lamp: THREE.Mesh; light: THREE.PointLight; group: THREE.Group }
let lanternViews = new Map<string, LanternView>();
const moteViews = new Map<string, THREE.Mesh>();
const shadeViews = new Map<string, THREE.Mesh>();

function buildLanterns(w: World) {
  for (const v of lanternViews.values()) scene.remove(v.group);
  lanternViews = new Map();
  for (const l of w.lanterns) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3, 8), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
    pole.position.y = 1.5;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0x553322 }));
    lamp.position.y = 3.4;
    const light = new THREE.PointLight(COLORS.warm, 0, 18);
    light.position.y = 3.4;
    group.add(pole, lamp, light);
    group.position.set(...l.pos);
    scene.add(group);
    lanternViews.set(l.id, { lamp, light, group });
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
  seed = (Date.now() & 0x7fffffff) >>> 0;
  world = createWorld(seed);
  buildLanterns(world);
}
restart();

const hud = document.getElementById("hud")!;
const overlay = document.getElementById("overlay")!;
const DT = 1 / WORLD.tick_rate;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) { step(world, readInput()); acc -= DT; }
  render(now / 1000);
  requestAnimationFrame(frame);
}

function render(t: number) {
  const w = world;
  player.position.set(...w.player.pos);
  const yaw = (camYawDeg * Math.PI) / 180;
  player.rotation.y = yaw;
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-8);
  camera.position.set(w.player.pos[0] + back.x, w.player.pos[1] + 5, w.player.pos[2] + back.z);
  camera.lookAt(w.player.pos[0], w.player.pos[1] + 1.2, w.player.pos[2]);

  let lit = 0;
  for (const l of w.lanterns) {
    const v = lanternViews.get(l.id)!;
    const mat = v.lamp.material as THREE.MeshStandardMaterial;
    if (l.lit) lit++;
    mat.emissive.setHex(l.lit ? COLORS.warm : 0x000000);
    mat.emissiveIntensity = l.lit ? 2.5 : 0;
    v.light.intensity = l.lit ? 40 : 0;
  }
  syncMap(w.motes, moteViews, () => new THREE.Mesh(moteGeo, moteMat), (m, it) =>
    m.position.set(it.pos[0], 0.6 + 0.15 * Math.sin(t * 3 + it.pos[0]), it.pos[2]));
  syncMap(w.shades, shadeViews, () => new THREE.Mesh(shadeGeo, shadeMat), (m, it) => {
    m.position.set(...it.pos);
    m.material = it.state === "stunned" ? shadeStunMat : shadeMat;
  });

  hud.innerHTML =
    `Thời gian: ${timeLeftS(w).toFixed(0)}s · Điểm: ${w.score}<br>` +
    `Lửa: ${"♥".repeat(w.player.flames)} · Đom đóm: ${w.player.carried}/${TUNING.carry_capacity}<br>` +
    `Đèn: ${lit}/${w.lanterns.length} · seed ${seed}`;
  overlay.innerHTML = w.state === "playing" ? "" :
    `<h1>${w.state === "won" ? "Đảo đã sáng lại!" : "Bóng tối thắng đêm nay"}</h1><div>Điểm: ${w.score} · Nhấn R để chơi lại</div>`;

  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
requestAnimationFrame(frame);
