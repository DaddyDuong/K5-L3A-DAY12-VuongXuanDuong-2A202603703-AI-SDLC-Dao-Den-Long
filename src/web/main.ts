// Rendering, screens and keyboard/mouse only. All gameplay lives in src/sim (same step() as headless).
// Flow (Ticket-02 item 3): menu → night intro → play → result → next night … → Bình Minh after night 3.
import * as THREE from "three";
import { BENCH, benchCamera, createBenchWorld } from "../sim/bench.js";
import { InputTimeline, parseInputs, type InputFrame } from "../sim/inputs.js";
import { MAPS, type NightId } from "../sim/maps.js";
import { litNeeded, step } from "../sim/step.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import { DEFAULT_INPUT, type InputState, type SimEvent, type World } from "../sim/types.js";
import { createWorld, timeLeftS } from "../sim/world.js";
import { Sound } from "./audio.js";
import { Hud } from "./hud.js";
import { ACTIONS as KEY_ACTIONS, ACTION_LABELS, DEFAULT_KEYS, assignKey, keyLabel, type Action } from "./keys.js";
import { loadBoard, saveScore } from "./scores.js";
import { SENSITIVITY_RANGE, loadSettings, saveSettings } from "./settings.js";
import { NightView } from "./world3d.js";

// ---------- URL options ----------
// Replay: ?seed=N&night=K&replay=<inputs.json>[&speed=S] plays a contract inputs file through the same step().
// Whole run: ?seed=7&replay=replays/n{night}-seed7-win.inputs.json; ?seed=7,11,1 + "{seed}" in the URL = one seed per night.
// A "{night}" in the replay URL (e.g. replays/n{night}-seed7-win.inputs.json) replays the whole 3-night run.
// ?night=K jumps straight to that night's intro; ?fps=1 shows the average FPS (evidence for the 30 FPS target).
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const nightParam = Number(params.get("night") ?? "0");
const replayUrl = params.get("replay");
const speed = Math.max(0.25, Number(params.get("speed") ?? "1") || 1);
const showFps = params.has("fps");
// Ticket-04 §1: ?bench=<seed>&duration=<s> plays the standard benchmark scene (used by `bench_cmd`, src/app/bench.ts).
const benchParam = params.get("bench");

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

type Mode = "menu" | "intro" | "play" | "paused" | "settings" | "result" | "dawn" | "board";
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
// Ticket-04 §3 / P4-A18: one seed per run (every night of the run), recorded with the leaderboard entry.
let runSeed: number | null = null;
let runFirstSeed: number | null = null;
const lowFuel = new Set<string>(); // lanterns already announced as below 30 fuel
/** Waiting for a key to bind in the settings screen (Ticket-04 §4). */
let capturing: Action | null = null;

function newRun() {
  wonScores.clear();
  runSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  runFirstSeed = null;
}

// ---------- input (keys follow settings.keys, Ticket-04 §4) ----------
const keys = new Set<string>();
const isGameKey = (code: string) => code === "ArrowLeft" || code === "ArrowRight" || KEY_ACTIONS.some((a) => settings.keys[a] === code);
addEventListener("keydown", (e) => {
  sound.unlock();
  if (capturing) {
    e.preventDefault();
    if (!e.repeat) captureKey(e.code);
    return;
  }
  if (e.target instanceof HTMLInputElement && e.target.type === "text") return; // typing a leaderboard name
  if (isGameKey(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === settings.keys.pause) {
    if (mode === "play") pause();
    else if (mode === "paused") resume();
    else if (mode === "settings") closeSettings();
    else if (mode === "board" && e.code === "Escape") showMenu();
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
  const k = settings.keys;
  const x = (keys.has(k.left) ? 1 : 0) - (keys.has(k.right) ? 1 : 0);
  const z = (keys.has(k.forward) ? 1 : 0) - (keys.has(k.back) ? 1 : 0);
  if (keys.has("ArrowLeft")) camYawDeg += 2;
  if (keys.has("ArrowRight")) camYawDeg -= 2;
  return {
    ...DEFAULT_INPUT,
    move: [x, z],
    cam_yaw_deg: camYawDeg,
    jump: keys.has(k.jump),
    interact: keys.has(k.interact),
    pulse: keys.has(k.pulse),
    dash: keys.has(k.dash),
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
    newRun();
    showIntro(1);
  },
  night: (n) => {
    newRun();
    showIntro(Number(n) as NightId);
  },
  board: () => void showBoard(),
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
      <button data-act="board">Bảng xếp hạng</button>
      <button data-act="settings">Cài đặt</button>
      <p class="keys">${keysHint()}</p>
    </div>`);
}

function keysHint(): string {
  const k = (a: Action) => keyLabel(settings.keys[a]).replace(/ (trái|phải)$/, "");
  return (
    `${k("forward")} ${k("left")} ${k("back")} ${k("right")} di chuyển · Chuột / ← → xoay camera · ${k("jump")} nhảy · ` +
    `${k("dash")} lướt · ${k("interact")} nạp đèn · ${k("pulse")} tỏa sáng · Esc / ${k("pause")} tạm dừng`
  );
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- leaderboard (Ticket-04 §3) ----------
const runTotal = () => [...wonScores.values()].reduce((a, b) => a + b, 0);

/** Name form shown after a lost night and on the Bình Minh screen (not in replays, P4-A19). */
function saveForm(): string {
  if (timeline) return "";
  return `
    <form class="save" id="save-form" autocomplete="off">
      <label for="save-name">Lưu vào Bảng xếp hạng: ${runTotal()} điểm · ${wonScores.size} Đêm thắng</label>
      <div class="row">
        <input id="save-name" type="text" maxlength="24" placeholder="Tên (3–12 ký tự)" spellcheck="false" />
        <button type="submit">Lưu điểm</button>
      </div>
      <p class="msg" id="save-msg" role="status"></p>
    </form>`;
}

let saving = false;
async function submitScore() {
  const input = document.getElementById("save-name") as HTMLInputElement | null;
  const msg = document.getElementById("save-msg");
  if (!input || !msg || saving) return;
  saving = true;
  const r = await saveScore({ name: input.value, score: runTotal(), nights_won: wonScores.size, seed: runFirstSeed ?? seed });
  saving = false;
  if (!r.ok) {
    msg.textContent = r.error;
    msg.className = "msg err";
    input.focus();
    return;
  }
  const rank = r.entries.indexOf(r.entries.find((e) => e.name === r.entry.name && e.achieved_at === r.entry.achieved_at)!) + 1;
  const form = document.getElementById("save-form")!;
  form.innerHTML = `<p class="msg ok">Đã lưu “${esc(r.entry.name)}” — ${rank > 0 ? `hạng ${rank}` : "ngoài top 10"}${r.where === "browser" ? " (lưu trong trình duyệt)" : ""}.</p>
    <button type="button" data-act="board">Xem Bảng xếp hạng</button>`;
  form.querySelector("button")!.addEventListener("click", () => void showBoard());
}

async function showBoard() {
  mode = "board";
  hud.show(false);
  render(`<div class="panel board"><h1>Bảng xếp hạng</h1><p class="sub">Đang tải…</p></div>`);
  const b = await loadBoard();
  if (mode !== "board") return;
  const rows = b.entries
    .map((e, i) => {
      const at = e.achieved_at.replace("T", " ").slice(0, 16);
      return `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td><td>${e.nights_won}/3</td><td>${at}</td><td>${e.seed}</td></tr>`;
    })
    .join("");
  render(`
    <div class="panel board">
      <h1>Bảng xếp hạng</h1>
      ${b.entries.length
        ? `<table class="lb"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm</th><th>Thời điểm</th><th>Seed</th></tr>${rows}</table>`
        : `<p class="sub">Chưa có ai. Thua một Đêm hoặc tới Bình Minh để lưu điểm.</p>`}
      <p class="note">${b.where === "disk" ? `Lưu trên đĩa: ${esc(b.storage ?? "")}` : "Trang không chạy qua server của game nên điểm được lưu trong trình duyệt này (chạy npm start để lưu trên đĩa)."}</p>
      <button class="primary" data-act="menu">Về menu</button>
    </div>`);
}

function showIntro(n: NightId) {
  mode = "intro";
  hud.show(false);
  if (runSeed === null) newRun();
  loadNight(n);
  runFirstSeed ??= seed;
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
      ${won ? "" : saveForm()}
      <button data-act="menu">Về menu</button>
    </div>`);
  bindSaveForm();
}

function bindSaveForm() {
  const form = document.getElementById("save-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitScore();
  });
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
      ${saveForm()}
      <button class="primary" data-act="menu">Về menu</button>
    </div>`);
  bindSaveForm();
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
  if (mode !== "settings") settingsBack = mode === "paused" ? "paused" : "menu";
  mode = "settings";
  capturing = null;
  const sens = Math.round(((settings.mouseSensitivity - SENSITIVITY_RANGE.min) / (SENSITIVITY_RANGE.max - SENSITIVITY_RANGE.min)) * 100);
  const check = (id: string, on: boolean, label: string) =>
    `<label class="check"><input id="${id}" type="checkbox" ${on ? "checked" : ""}> ${label}</label>`;
  render(`
    <div class="panel settings">
      <h1>Cài đặt</h1>
      <div class="cols">
        <div>
          <label>Âm lượng <output id="vol-out">${Math.round(settings.volume * 100)}</output>
            <input id="vol" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"></label>
          <label>Độ nhạy chuột <output id="sens-out">${sens}</output>
            <input id="sens" type="range" min="0" max="100" value="${sens}"></label>
          ${check("cb", settings.colorblind, "Bảng màu dễ phân biệt")}
          ${check("cap", settings.captions, "Phụ đề và mũi tên chỉ báo")}
          ${check("rm", settings.reduceMotion, "Giảm chuyển động (không rung, không chớp)")}
          ${check("lg", settings.largeText, "Chữ lớn (×1.25)")}
        </div>
        <div>
          <h2>Đổi phím</h2>
          <table class="keymap">
            ${KEY_ACTIONS.map((a) => `<tr><td>${ACTION_LABELS[a]}</td><td><button class="key" data-key="${a}">${keyLabel(settings.keys[a])}</button></td></tr>`).join("")}
          </table>
          <p class="msg" id="key-msg" role="status">Bấm vào một phím để đổi. Esc luôn là tạm dừng; ← → xoay camera.</p>
          <button id="key-reset">Khôi phục mặc định</button>
        </div>
      </div>
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
  sensEl.addEventListener("input", () => {
    settings.mouseSensitivity = SENSITIVITY_RANGE.min + (Number(sensEl.value) / 100) * (SENSITIVITY_RANGE.max - SENSITIVITY_RANGE.min);
    document.getElementById("sens-out")!.textContent = sensEl.value;
    saveSettings(settings);
  });
  const toggle = (id: string, set: (on: boolean) => void) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.addEventListener("change", () => {
      set(el.checked);
      applyAccessibility();
      saveSettings(settings);
    });
  };
  toggle("cb", (on) => (settings.colorblind = on));
  toggle("cap", (on) => (settings.captions = on));
  toggle("rm", (on) => (settings.reduceMotion = on));
  toggle("lg", (on) => (settings.largeText = on));
  for (const b of screen.querySelectorAll<HTMLButtonElement>("button.key")) {
    b.addEventListener("click", () => {
      for (const o of screen.querySelectorAll("button.key.wait")) o.classList.remove("wait");
      capturing = b.dataset.key as Action;
      b.classList.add("wait");
      b.textContent = "Nhấn phím…";
      keyMsg(`Nhấn phím mới cho “${ACTION_LABELS[capturing]}” (Esc để hủy).`);
      b.blur();
    });
  }
  document.getElementById("key-reset")!.addEventListener("click", () => {
    settings.keys = { ...DEFAULT_KEYS };
    saveSettings(settings);
    applyAccessibility();
    openSettings();
    keyMsg("Đã khôi phục phím mặc định.", "ok");
  });
}

function keyMsg(text: string, kind: "" | "ok" | "err" = "") {
  const m = document.getElementById("key-msg");
  if (!m) return;
  m.textContent = text;
  m.className = `msg ${kind}`;
}

/** Ticket-04 §4: binds the pressed key, refusing one already used (the conflict is named) or reserved. */
function captureKey(code: string) {
  const action = capturing!;
  capturing = null;
  const btn = screen.querySelector<HTMLButtonElement>(`button.key[data-key="${action}"]`);
  btn?.classList.remove("wait");
  if (code === "Escape") {
    if (btn) btn.textContent = keyLabel(settings.keys[action]);
    keyMsg("Đã hủy.");
    return;
  }
  const r = assignKey(settings.keys, action, code);
  if (!r.ok) {
    if (btn) btn.textContent = keyLabel(settings.keys[action]);
    btn?.classList.add("clash");
    setTimeout(() => btn?.classList.remove("clash"), 1200);
    keyMsg(`Trùng phím: ${keyLabel(code)} đang dùng cho “${r.conflict}”. Chọn phím khác.`, "err");
    sound.play("hit");
    return;
  }
  settings.keys = r.keys;
  saveSettings(settings);
  applyAccessibility();
  if (btn) btn.textContent = keyLabel(code);
  keyMsg(`“${ACTION_LABELS[action]}” = ${keyLabel(code)}.`, "ok");
}

/** Ticket-03 §6 colour-blind palette + Ticket-04 §4 options, for the UI (CSS classes) and the 3D view. */
function applyAccessibility() {
  document.body.classList.toggle("cb", settings.colorblind);
  document.body.classList.toggle("rm", settings.reduceMotion);
  document.documentElement.classList.toggle("large", settings.largeText);
  view?.setColorblind(settings.colorblind);
  view?.setReduceMotion(settings.reduceMotion);
  hud.setKeys(settings.keys);
  if (!settings.captions) hud.clearPointers();
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
  // `?seed=7` for every night, or `?seed=7,11,1` = one seed per night.
  const seeds = seedParam?.split(",").map(Number);
  seed = seeds ? (seeds[n - 1] ?? seeds[0]!) : (runSeed ?? (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  world = createWorld(seed, n);
  view?.dispose();
  view = new NightView(MAPS[n], innerWidth / innerHeight);
  applyAccessibility();
  camYawDeg = 0;
  endAt = -1;
  endReason = "";
  lastCountdown = -1;
  windWarned = false;
  lowFuel.clear();
  hud.clearPointers();
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
        if (!settings.reduceMotion) {
          // Red edge flash + camera shake; both off with "Giảm chuyển động" (Ticket-04 §4).
          document.body.classList.remove("hit");
          void document.body.offsetWidth;
          document.body.classList.add("hit");
          v.shakeFx(t);
        }
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
        if (settings.captions) {
          hud.caption("Bóng Mực xuất hiện", "shade");
          hud.point("shade", e.data.id as string, 4, t);
        }
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
      // Last 10 seconds: one tick per second (+ caption).
      const left = Math.ceil(timeLeftS(w));
      if (left <= 10 && left > 0 && left !== lastCountdown) {
        lastCountdown = left;
        sound.play("tick");
        if (settings.captions) hud.caption(left === 10 ? "Còn 10 giây tới bình minh!" : `Còn ${left} giây`, "time", 1);
      }
      // Gust announced 2 s ahead: leaves + sound (+ caption).
      if (w.wind.warning && !windWarned) {
        windWarned = true;
        sound.play("wind");
        hud.flash("Gió mạnh sắp thổi!", 2, t, true);
        if (settings.captions) hud.caption("Gió mạnh sắp thổi (2 giây)", "wind");
      }
      if (!w.wind.warning) windWarned = false;
      // A lantern dropping below 30 fuel: caption + edge arrow (Ticket-04 §4).
      for (const l of w.lanterns) {
        const low = l.lit && l.fuel < WORLD.low_fuel_units;
        if (low && !lowFuel.has(l.id)) {
          lowFuel.add(l.id);
          if (settings.captions) {
            hud.caption(`Đèn ${l.id} sắp cạn dầu (còn ${Math.floor(l.fuel / WORLD.fuel_units_per_fuel)})`, "fuel", 4);
            hud.point("fuel", l.id, 6, t);
          }
        } else if (!low) lowFuel.delete(l.id);
      }
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
  if (benchParam !== null) return; // the bench keeps its 1280×720 drawing buffer
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

// ---------- benchmark scene (Ticket-04 §1, P4-A1…A10) ----------
// Fixed 1280×720 drawing buffer at pixel ratio 1, night 1 with full lighting and the HUD, no input, the sim stepped at
// 60 Hz from real time, the camera on its 15 s orbit. dt = time between two animation frames; the first 3 s are warm-up,
// then frames are measured until their sum reaches `duration`. The frame times are posted to the bench server.
function runBench(benchSeed: number, durationS: number) {
  render("");
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720);
  const w = createBenchWorld(benchSeed);
  const v = new NightView(MAPS[1], 1280 / 720);
  world = w;
  view = v;
  hud.show(true);
  hud.setTag(`BENCH · seed ${benchSeed} · ${durationS} s`);
  const dts: number[] = [];
  let first = -1;
  let prev = -1;
  let total = 0;
  let firstFrameEpoch = 0;
  let measureStartEpoch = 0;
  let simAcc = 0;
  const epoch = () => performance.timeOrigin + performance.now();
  const frame = (now: number) => {
    if (first < 0) first = now;
    else {
      simAcc += Math.min(0.25, (now - prev) / 1000);
      while (simAcc >= DT) {
        step(w, DEFAULT_INPUT);
        simAcc -= DT;
      }
    }
    v.update(w, 0, now / 1000);
    v.camera.position.set(...benchCamera((now - first) / 1000));
    v.camera.lookAt(0, 0, 0);
    hud.update(w, v.camera, now / 1000);
    renderer.render(v.scene, v.camera);
    if (prev < 0) firstFrameEpoch = epoch();
    else if (now - first >= BENCH.warmupMs) {
      if (dts.length === 0) measureStartEpoch = epoch();
      dts.push(now - prev);
      total += now - prev;
    }
    prev = now;
    if (total < durationS * 1000) {
      requestAnimationFrame(frame);
      return;
    }
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const report = {
      dts,
      firstFrameEpoch,
      measureStartEpoch,
      measureEndEpoch: epoch(),
      gl: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      three: THREE.REVISION,
      ua: navigator.userAgent,
      inner: [innerWidth, innerHeight],
      canvas: [renderer.domElement.width, renderer.domElement.height],
      dpr: devicePixelRatio,
    };
    hud.setTag(`BENCH xong: ${dts.length} khung`);
    void fetch("api/bench", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) });
  };
  requestAnimationFrame(frame);
}

if (benchParam !== null) {
  runBench(Number(benchParam) || 0, Number(params.get("duration") ?? "30") || 30);
} else if (replayUrl) {
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
if (benchParam === null) requestAnimationFrame(tick);
