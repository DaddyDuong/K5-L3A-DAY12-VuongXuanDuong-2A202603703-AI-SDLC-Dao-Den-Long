// Rendering, screens and keyboard/mouse only. All gameplay lives in src/sim (same step() as headless).
// Flow (Ticket-02 item 3): menu → night intro → play → result → next night … → Bình Minh after night 3.
import * as THREE from "three";
import { InputTimeline, parseInputs, type InputFrame } from "../sim/inputs.js";
import { MAPS, type NightId } from "../sim/maps.js";
import { litNeeded, step } from "../sim/step.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import { DEFAULT_INPUT, type InputState, type SimEvent, type World } from "../sim/types.js";
import { createWorld, timeLeftS } from "../sim/world.js";
import { Sound } from "./audio.js";
import { Hud } from "./hud.js";
import { SENSITIVITY_RANGE, loadSettings, saveSettings } from "./settings.js";
import { NightView } from "./world3d.js";

// ---------- URL options ----------
// Replay: ?seed=N&night=K&replay=<inputs.json>[&speed=S] plays a contract inputs file through the same step().
// Whole run: ?seed=7,11,1&replay=replays/n{night}-seed{seed}-win.inputs.json (one seed per night).
// A "{night}" in the replay URL (e.g. replays/n{night}-seed7-win.inputs.json) replays the whole 3-night run.
// ?night=K jumps straight to that night's intro; ?fps=1 shows the average FPS (evidence for the 30 FPS target).
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const nightParam = Number(params.get("night") ?? "0");
const replayUrl = params.get("replay");
const speed = Math.max(0.25, Number(params.get("speed") ?? "1") || 1);
const showFps = params.has("fps");

const INTROS: Record<NightId, string> = {
  1: "Mây à, đèn trên Đảo Bến tắt hết cả rồi. Gom đom đóm thắp đèn, và giữ ít nhất ba ngọn còn sáng tới lúc trời hửng nhé. Đèn cạn dầu thì châm thêm; đèn sắp cạn là Bóng Mực kéo tới hút.",
  2: "Đảo Cau là hai hòn nối nhau bằng chiếc cầu tre không lan can. Bục nhảy sẽ hất con sang bờ bên kia. Coi chừng Gió Lạc: mang nhiều đom đóm là nó tới giật đấy.",
  3: "Tháp chuông đứng trên ba tầng đá của Đảo Chuông. Gió mạnh thổi từng cơn, thấy lá bay là gió sắp tới. Giữ năm trong bảy ngọn đèn sáng tới bình minh để chuông ngân.",
};
const REASONS: Record<string, string> = {
  dawn_survived: "Mây giữ đảo sáng tới bình minh.",
  no_flames: "Mây đã hết Ngọn Lửa.",
  dawn: "Trời đã sáng mà đảo vẫn chưa đủ đèn.",
};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const settings = loadSettings();
const sound = new Sound(settings.volume);
const hud = new Hud();
const screen = document.getElementById("screen")!;
const fpsEl = document.getElementById("fps")!;
fpsEl.classList.toggle("hidden", !showFps);

type Mode = "menu" | "intro" | "play" | "paused" | "settings" | "result" | "dawn";
let mode: Mode = "menu";
let settingsBack: Mode = "menu";
let night: NightId = 1;
let seed = 0;
let world: World | null = null;
let view: NightView | null = null;
let timeline: InputTimeline | null = null;
const replays = new Map<NightId, InputFrame[]>();
let camYawDeg = 0;
let endAt = -1;
let endReason = "";
let lastCountdown = -1;
let windWarned = false;
const wonScores = new Map<NightId, number>();

// ---------- input ----------
const keys = new Set<string>();
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ArrowLeft", "ArrowRight", "KeyE", "KeyF"]);
addEventListener("keydown", (e) => {
  sound.unlock();
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    if (mode === "play") pause();
    else if (mode === "paused") resume();
    else if (mode === "settings") closeSettings();
  } else if (e.code === "Enter" || (e.code === "Space" && mode !== "play")) {
    const primary = screen.querySelector<HTMLButtonElement>("button.primary");
    if (primary && mode !== "play") primary.click();
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
renderer.domElement.addEventListener("click", () => {
  sound.unlock();
  if (mode === "play" && !timeline) void renderer.domElement.requestPointerLock?.();
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === renderer.domElement && mode === "play") camYawDeg -= e.movementX * settings.mouseSensitivity;
});
// Losing the pointer lock (Esc) while playing pauses the game.
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && mode === "play" && !timeline) pause();
});

function readInput(): InputState {
  // Camera faces +Z at yaw 0, so screen-right is −X: D maps to x = −1 (contract §C rotation).
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
    dash: keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
}

// ---------- screens ----------
function render(html: string) {
  screen.innerHTML = html;
  screen.classList.toggle("hidden", html === "");
  for (const b of screen.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
    b.addEventListener("click", () => {
      sound.unlock();
      sound.play("click");
      ACTIONS[b.dataset.act!]?.(b.dataset.arg ?? "");
    });
  }
}

const ACTIONS: Record<string, (arg: string) => void> = {
  start: () => {
    wonScores.clear();
    showIntro(1);
  },
  night: (n) => showIntro(Number(n) as NightId),
  go: () => beginPlay(),
  resume: () => resume(),
  restart: () => showIntro(night),
  menu: () => showMenu(),
  settings: () => openSettings(),
  back: () => closeSettings(),
  next: () => (night < 3 ? showIntro((night + 1) as NightId) : showDawn()),
};

function showMenu() {
  mode = "menu";
  hud.show(false);
  sound.stopMusic();
  if (document.pointerLockElement) document.exitPointerLock();
  loadNight(nightParam >= 1 && nightParam <= 3 ? (nightParam as NightId) : 1);
  render(`
    <div class="panel menu">
      <h1>Đảo Đèn Lồng</h1>
      <p class="sub">Ba đêm, ba hòn đảo. Gom đom đóm, thắp lại đèn lồng trước bình minh.</p>
      <button class="primary" data-act="start">Bắt đầu hành trình</button>
      <div class="row">
        ${([1, 2, 3] as NightId[]).map((n) => `<button data-act="night" data-arg="${n}">Đêm ${n} · ${MAPS[n].name}</button>`).join("")}
      </div>
      <button data-act="settings">Cài đặt</button>
      <p class="keys">WASD di chuyển · Chuột / ← → xoay camera · Space nhảy · Shift lướt · E nạp đèn · F tỏa sáng · Esc / P tạm dừng</p>
    </div>`);
}

function showIntro(n: NightId) {
  mode = "intro";
  hud.show(false);
  loadNight(n);
  render(`
    <div class="panel intro">
      <div class="eyebrow">Đêm ${n} / 3</div>
      <h1>${MAPS[n].name}</h1>
      <blockquote>“${INTROS[n]}”<cite>— Ông Đăng</cite></blockquote>
      <p class="sub">${MAPS[n].lanterns.length} Đèn Lồng Lớn · cần ${litNeeded(MAPS[n].lanterns.length)} đèn sáng lúc bình minh · ${Math.round(MAPS[n].duration_s / 60 * 10) / 10} phút</p>
      <button class="primary" data-act="go">Vào đêm (Enter)</button>
      <button data-act="menu">Về menu</button>
    </div>`);
}

function showResult() {
  mode = "result";
  hud.show(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const w = world!;
  const won = w.state === "won";
  if (won) wonScores.set(night, Math.max(wonScores.get(night) ?? 0, w.score));
  const litL = w.lanterns.filter((l) => l.lit);
  const lit = litL.length;
  // Ticket-03 §5: dawn bonus per lit lantern (50 + floor(fuel)) and per flame; the time bonus is gone.
  const bonusLamps = won ? litL.reduce((a, l) => a + TUNING.score.per_lit_at_dawn + Math.floor(l.fuel / WORLD.fuel_units_per_fuel), 0) : 0;
  const bonusFlames = won ? w.player.flames * TUNING.score.per_flame_left : 0;
  render(`
    <div class="panel result ${won ? "won" : "lost"}">
      <div class="eyebrow">Đêm ${night} · ${MAPS[night].name}${timeline ? " · REPLAY" : ""}</div>
      <h1>${won ? "Đảo đã sáng lại!" : "Bóng tối thắng đêm nay"}</h1>
      <p class="sub">${endReason}</p>
      <table>
        <tr><td>Đèn sáng lúc kết thúc</td><td>${lit}/${w.lanterns.length} (cần ${litNeeded(w.lanterns.length)})</td></tr>
        ${won ? `<tr><td>Thưởng bình minh (${lit} đèn × (${TUNING.score.per_lit_at_dawn} + dầu còn lại))</td><td>+${bonusLamps}</td></tr>
        <tr><td>Thưởng Ngọn Lửa (${w.player.flames} × ${TUNING.score.per_flame_left})</td><td>+${bonusFlames}</td></tr>` : ""}
        <tr class="total"><td>Điểm Đêm ${night}</td><td>${w.score}</td></tr>
      </table>
      ${won
        ? `<button class="primary" data-act="next">${night < 3 ? `Đêm ${night + 1} →` : "Đón Bình Minh →"}</button>`
        : `<button class="primary" data-act="restart">Chơi lại Đêm ${night}</button>`}
      <button data-act="menu">Về menu</button>
    </div>`);
}

function showDawn() {
  mode = "dawn";
  hud.show(false);
  sound.stopMusic();
  sound.play("win");
  const total = [...wonScores.values()].reduce((a, b) => a + b, 0);
  render(`
    <div class="panel dawn">
      <div class="eyebrow">Bình Minh</div>
      <h1>Ba hòn đảo đã sáng đèn</h1>
      <p class="sub">Chuông Đảo Chuông ngân lên, mặt trời nhô khỏi biển mây.</p>
      <table>
        ${([1, 2, 3] as NightId[]).map((n) => `<tr><td>Đêm ${n} · ${MAPS[n].name}</td><td>${wonScores.get(n) ?? "—"}</td></tr>`).join("")}
        <tr class="total"><td>Tổng điểm</td><td>${total}</td></tr>
      </table>
      <button class="primary" data-act="menu">Về menu</button>
    </div>`);
  document.body.classList.add("dawn");
}

function pause() {
  if (mode !== "play" || !world || world.state !== "playing") return;
  mode = "paused";
  if (document.pointerLockElement) document.exitPointerLock();
  render(`
    <div class="panel pause">
      <h1>Tạm dừng</h1>
      <button class="primary" data-act="resume">Tiếp tục</button>
      <button data-act="restart">Chơi lại Đêm</button>
      <button data-act="settings">Cài đặt</button>
      <button data-act="menu">Về menu</button>
    </div>`);
}

function resume() {
  if (mode !== "paused") return;
  mode = "play";
  render("");
  last = performance.now();
  if (!timeline) void renderer.domElement.requestPointerLock?.();
}

function openSettings() {
  settingsBack = mode === "paused" ? "paused" : "menu";
  mode = "settings";
  const sens = Math.round(((settings.mouseSensitivity - SENSITIVITY_RANGE.min) / (SENSITIVITY_RANGE.max - SENSITIVITY_RANGE.min)) * 100);
  render(`
    <div class="panel settings">
      <h1>Cài đặt</h1>
      <label>Âm lượng <output id="vol-out">${Math.round(settings.volume * 100)}</output>
        <input id="vol" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"></label>
      <label>Độ nhạy chuột <output id="sens-out">${sens}</output>
        <input id="sens" type="range" min="0" max="100" value="${sens}"></label>
      <label class="check"><input id="cb" type="checkbox" ${settings.colorblind ? "checked" : ""}> Bảng màu dễ phân biệt</label>
      <p class="sub">Được lưu lại cho lần mở game sau.</p>
      <button class="primary" data-act="back">Xong</button>
    </div>`);
  const vol = document.getElementById("vol") as HTMLInputElement;
  const sensEl = document.getElementById("sens") as HTMLInputElement;
  vol.addEventListener("input", () => {
    settings.volume = Number(vol.value) / 100;
    document.getElementById("vol-out")!.textContent = vol.value;
    sound.setVolume(settings.volume);
    saveSettings(settings);
  });
  vol.addEventListener("change", () => sound.play("pick"));
  const cbEl = document.getElementById("cb") as HTMLInputElement;
  cbEl.addEventListener("change", () => {
    settings.colorblind = cbEl.checked;
    applyColorblind();
    saveSettings(settings);
  });
  sensEl.addEventListener("input", () => {
    settings.mouseSensitivity = SENSITIVITY_RANGE.min + (Number(sensEl.value) / 100) * (SENSITIVITY_RANGE.max - SENSITIVITY_RANGE.min);
    document.getElementById("sens-out")!.textContent = sensEl.value;
    saveSettings(settings);
  });
}

/** Ticket-03 §6: colour-blind palette for the UI (CSS) and the 3D view. */
function applyColorblind() {
  document.body.classList.toggle("cb", settings.colorblind);
  view?.setColorblind(settings.colorblind);
}

function closeSettings() {
  if (settingsBack === "paused") {
    mode = "play"; // pause() requires play mode
    pause();
  } else showMenu();
}

// ---------- night lifecycle ----------
function loadNight(n: NightId) {
  night = n;
  // `?seed=7` for every night, or `?seed=7,11,1` = one seed per night (replays of the bot's known wins).
  const seeds = seedParam?.split(",").map(Number);
  seed = seeds ? (seeds[n - 1] ?? seeds[0]!) : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  world = createWorld(seed, n);
  view?.dispose();
  view = new NightView(MAPS[n], innerWidth / innerHeight);
  applyColorblind();
  camYawDeg = 0;
  endAt = -1;
  endReason = "";
  lastCountdown = -1;
  windWarned = false;
  document.body.classList.remove("dawn");
  const frames = replays.get(n);
  timeline = frames ? new InputTimeline(frames) : null;
  hud.setTag(`Đêm ${n} · ${MAPS[n].name} · seed ${seed}${timeline ? ` · REPLAY ×${speed}` : ""}`);
}

function beginPlay() {
  mode = "play";
  render("");
  hud.show(true);
  sound.startMusic(night);
  last = performance.now();
  acc = 0;
  if (!timeline) void renderer.domElement.requestPointerLock?.();
}

// ---------- game loop: fixed 60 Hz, same step() as headless ----------
const DT = 1 / WORLD.tick_rate;
let acc = 0;
let last = performance.now();
let fpsFrames = 0;
let fpsSince = performance.now();
const fpsSamples: number[] = [];

function nextInput(w: World): InputState {
  if (!timeline) return readInput();
  const input = timeline.at(w.steps);
  camYawDeg = input.cam_yaw_deg;
  return input;
}

function onEvents(events: SimEvent[], t: number) {
  const v = view!;
  for (const e of events) {
    switch (e.name) {
      case "mote_picked":
        sound.play("pick");
        break;
      case "deposit":
      case "refuel":
        sound.play("deposit");
        break;
      case "lantern_out":
        sound.play("shade");
        hud.flash("Một ngọn đèn đã cạn dầu và tắt!", 2, t, true);
        break;
      case "lantern_lit":
        sound.play("light");
        v.lanternLitFx(e.data.lantern_id as string, t);
        hud.flash(e.data.relight ? "Đèn đã được thắp lại!" : "Một ngọn đèn đã sáng!", 1.8, t);
        break;
      case "pulse":
        sound.play("pulse");
        v.pulseFx(t);
        break;
      case "player_hit":
        sound.play("hit");
        document.body.classList.remove("hit");
        void document.body.offsetWidth;
        document.body.classList.add("hit");
        if (e.data.by === "fall") hud.flash("Rơi xuống biển mây!", 2, t, true);
        break;
      case "dash":
        sound.play("dash");
        v.dashFx(t);
        break;
      case "charm_picked":
        sound.play("charm");
        hud.flash("Bùa Gió: chạy nhanh, lướt không hồi chiêu (10 s)", 2.5, t);
        break;
      case "drifter_steal":
        sound.play("steal");
        hud.flash(`Gió Lạc cướp mất ${e.data.amount} đom đóm!`, 2, t, true);
        break;
      case "drifter_drop":
        sound.play("pick");
        hud.flash("Gió Lạc đánh rơi đom đóm!", 1.8, t);
        break;
      case "shade_spawned":
        sound.play("shade");
        break;
      case "game_over":
        endReason = REASONS[e.data.reason as string] ?? "";
        endAt = t;
        sound.stopMusic();
        sound.play(e.data.result === "won" ? "win" : "lose");
        break;
    }
  }
}

function tick(now: number) {
  const t = now / 1000;
  const w = world;
  const v = view;
  if (w && v) {
    if (mode === "play" && w.state === "playing") {
      acc += Math.min(0.25, (now - last) / 1000) * (timeline ? speed : 1);
      while (acc >= DT && w.state === "playing") {
        const wasGrounded = w.player.grounded;
        const input = nextInput(w);
        onEvents(step(w, input), t);
        if (wasGrounded && !w.player.grounded && w.player.vy > 5 && !w.player.launch) sound.play("jump");
        acc -= DT;
      }
      // Last 10 seconds: one tick per second.
      const left = Math.ceil(timeLeftS(w));
      if (left <= 10 && left > 0 && left !== lastCountdown) {
        lastCountdown = left;
        sound.play("tick");
      }
      // Gust announced 2 s ahead: leaves + sound.
      if (w.wind.warning && !windWarned) {
        windWarned = true;
        sound.play("wind");
        hud.flash("Gió mạnh sắp thổi!", 2, t, true);
      }
      if (!w.wind.warning) windWarned = false;
    }
    last = now;
    if (mode === "play" && endAt >= 0 && t - endAt > 1.4) showResult();
    if (mode === "intro" || mode === "menu") camYawDeg += 0.08; // slow orbit behind the menus
    v.update(w, camYawDeg, t);
    if (mode === "play" || mode === "paused") hud.update(w, v.camera, t);
    renderer.render(v.scene, v.camera);
  }
  // FPS meter (average over 1 s windows).
  fpsFrames++;
  if (now - fpsSince >= 1000) {
    const fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsSamples.push(fps);
    if (fpsSamples.length > 30) fpsSamples.shift();
    const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
    fpsEl.textContent = `${fps.toFixed(0)} FPS · TB ${avg.toFixed(1)} (${fpsSamples.length}s) · ${innerWidth}×${innerHeight}`;
    fpsFrames = 0;
    fpsSince = now;
  }
  requestAnimationFrame(tick);
}

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  view?.resize(innerWidth / innerHeight);
});

// ---------- benchmark (?fps only) ----------
// rAF is throttled when the browser window is hidden/occluded, so the FPS meter can under-report.
// __bench(n) renders n frames back-to-back at a 1280×720 drawing buffer (pixel ratio 1) and waits for the GPU
// each frame (readPixels), giving the real cost per frame of the current scene.
if (showFps) {
  (window as unknown as { __bench: (n?: number) => unknown }).__bench = (n = 120) => {
    if (!world || !view) return null;
    const prevRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720, false);
    view.resize(1280 / 720);
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      view.update(world, camYawDeg + i * 0.5, t0 / 1000);
      renderer.render(view.scene, view.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
    }
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(innerWidth, innerHeight);
    view.resize(innerWidth / innerHeight);
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / n;
    const info = renderer.info.render;
    return {
      night,
      tick: world.steps,
      shades: world.shades.length,
      motes: world.motes.length,
      lit: world.lanterns.filter((l) => l.lit).length,
      frames: n,
      avgMs: +avg.toFixed(2),
      p95Ms: +times[Math.floor(n * 0.95)]!.toFixed(2),
      fpsEquivalent: +(1000 / avg).toFixed(1),
      drawCalls: info.calls,
      triangles: info.triangles,
    };
  };
}

// ---------- boot ----------
/** The `?seed=` value for night n (`7` or `7,11,1`), used to fill `{seed}` in a replay URL. */
function seedFor(n: number): string {
  const list = (seedParam ?? "").split(",");
  return list[n - 1] ?? list[0] ?? "";
}

if (replayUrl) {
  const first: NightId = nightParam >= 1 && nightParam <= 3 ? (nightParam as NightId) : 1;
  const nights: NightId[] = replayUrl.includes("{night}") ? [1, 2, 3] : [first];
  Promise.all(
    nights.map((n) =>
      fetch(replayUrl.replace("{night}", String(n)).replace("{seed}", seedFor(n)))
        .then((r) => r.json())
        .then((j) => replays.set(n, parseInputs(j))),
    ),
  )
    .then(() => {
      loadNight(first);
      beginPlay();
    })
    .catch((e) => {
      console.error("replay load failed", e);
      showMenu();
    });
} else if (nightParam >= 1 && nightParam <= 3) showIntro(nightParam as NightId);
else showMenu();
requestAnimationFrame(tick);
