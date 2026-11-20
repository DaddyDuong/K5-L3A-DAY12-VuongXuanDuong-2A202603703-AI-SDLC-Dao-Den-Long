#!/usr/bin/env node
// Records the CP5 demo video (Ticket-04 §7) without a screen recorder: the built game is served by run_cmd, an
// installed Chrome is driven through the DevTools Protocol (clicks, real key events), every repaint is captured with
// Page.startScreencast and the frames are joined by ffmpeg at their real timestamps.
// Terminal scenes show the real output of commands run during this script, replayed faster (said on screen).
// usage: npm run build && node scripts/record-demo.mjs [--out release/dao-den-long-demo.mp4] [--quick]
// Needs: Chrome/Chromium (CHROME_PATH), ffmpeg with libx264, Node ≥ 22 (global WebSocket).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const OUT = resolve(argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "release/dao-den-long-demo.mp4");
const QUICK = argv.includes("--quick"); // short mechanics check
const ROOT = resolve(".");
const WORK = mkdtempSync(join(tmpdir(), "ddl-demo-"));
const FRAMES = join(WORK, "frames");
mkdirSync(FRAMES);
mkdirSync("demo-out", { recursive: true });
const DATA = join(WORK, "data");
const PORT = 4380;
const CDP_PORT = 9333;
// same search order as src/app/bench.ts (importing it would start a benchmark)
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser", "brave"]) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"])
    if (existsSync(p)) return p;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[demo]", ...a);

// ---------- real command output (for the terminal scenes) ----------
function capture(display, opts = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    const lines = [];
    let buf = "";
    const p = spawn("bash", ["-c", opts.run ?? display], {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "1", DDL_DATA_DIR: DATA, ...(opts.env ?? {}) },
    });
    const onData = (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        lines.push({ t: (Date.now() - t0) / 1000, text: buf.slice(0, i) });
        buf = buf.slice(i + 1);
      }
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("close", (code) => {
      if (buf) lines.push({ t: (Date.now() - t0) / 1000, text: buf });
      done({ cmd: display, lines, real: (Date.now() - t0) / 1000, code });
    });
  });
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function ansiToHtml(s) {
  const COL = { 31: "#ff6b6b", 32: "#7ee787", 33: "#f2cc60", 34: "#79c0ff", 35: "#d2a8ff", 36: "#56d4dd", 90: "#8b949e", 37: "#e6edf3" };
  let out = "";
  let open = 0;
  const parts = s.replace(/\r/g, "").split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) out += esc(parts[i].replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""));
    else
      for (const c of parts[i].split(";").map(Number)) {
        if (c === 0 || c === 39 || c === 22) {
          out += "</span>".repeat(open);
          open = 0;
        } else if (c === 1) (out += '<span style="font-weight:700">'), open++;
        else if (c === 2) (out += '<span style="opacity:.6">'), open++;
        else if (COL[c]) (out += `<span style="color:${COL[c]}">`), open++;
        else if (c === 41 || c === 42) (out += `<span style="background:${c === 41 ? "#da3633" : "#238636"};color:#fff">`), open++;
      }
  }
  return out + "</span>".repeat(open);
}

const BASE_CSS = `html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0b1026;color:#e9e4d4;
  font-family:system-ui,"Noto Sans",sans-serif}`;
function cardPage(name, title, lines, kicker = "Đảo Đèn Lồng v1.0.0 · demo") {
  const f = join(WORK, `${name}.html`);
  writeFileSync(
    f,
    `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    .c{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 120px;
      background:radial-gradient(ellipse at 50% 110%,#3a2a12 0,#0b1026 60%)}
    .k{color:#ffb347;letter-spacing:.2em;text-transform:uppercase;font-size:20px;margin-bottom:18px}
    h1{font-size:54px;margin:0 0 26px;color:#ffcf70;text-shadow:0 0 24px #ff9d2e66}
    li{font-size:26px;line-height:1.6;color:#e9e4d4} ul{margin:0;padding-left:28px}</style>
    <div class="c"><div class="k">${esc(kicker)}</div><h1>${esc(title)}</h1><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`,
  );
  return "file://" + f;
}

function terminalPage(name, title, blocks, seconds) {
  const real = blocks.reduce((a, b) => a + b.real, 0);
  const typing = blocks.reduce((a, b) => a + Math.min(b.cmd.length * 0.025, 1.5) + 0.6, 0);
  const scale = Math.min(1, Math.max(0.05, (seconds - typing - 1.5) / Math.max(real, 0.01)));
  const data = blocks.map((b) => ({ cmd: b.cmd, real: b.real, lines: b.lines.map((l) => ({ t: l.t, h: ansiToHtml(l.text) })) }));
  const when = new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  const speed = scale >= 0.99 ? "tốc độ thật" : `phát lại nhanh ×${(1 / scale).toFixed(scale > 0.2 ? 1 : 0)}`;
  const f = join(WORK, `${name}.html`);
  writeFileSync(
    f,
    `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    .bar{height:44px;display:flex;align-items:center;gap:10px;padding:0 18px;background:#161b22;border-bottom:1px solid #30363d;font-size:17px}
    .dot{width:12px;height:12px;border-radius:50%} .t{flex:1;text-align:center;color:#c9d1d9}
    .n{color:#8b949e;font-size:15px}
    pre{margin:0;padding:14px 22px;height:calc(720px - 44px - 28px);box-sizing:border-box;overflow:hidden;background:#0d1117;
      color:#e6edf3;font:17px/1.42 "JetBrains Mono","DejaVu Sans Mono",monospace;white-space:pre-wrap;word-break:break-all}
    .p{color:#7ee787} .cmd{color:#fff;font-weight:600}
    .foot{height:28px;background:#161b22;color:#8b949e;font-size:14px;display:flex;align-items:center;padding:0 18px}</style>
    <div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span>
    <span class="dot" style="background:#27c93f"></span><span class="t">${esc(title)}</span><span class="n">${esc(speed)}</span></div>
    <pre id="o"></pre><div class="foot">Đầu ra thật của lệnh, chạy lúc ${esc(when)} trong lúc quay video (scripts/record-demo.mjs), ${esc(speed)}.</div>
    <script>
    const D=${JSON.stringify(data)}, S=${scale}, o=document.getElementById('o');
    const w=(ms)=>new Promise(r=>setTimeout(r,ms));
    (async()=>{for(const b of D){const p=document.createElement('div');p.innerHTML='<span class="p">$ </span><span class="cmd"></span>';
      o.appendChild(p);const c=p.querySelector('.cmd');const cd=Math.min(25,1500/b.cmd.length);for(const ch of b.cmd){c.textContent+=ch;await w(cd);}await w(450);
      let last=0;for(const l of b.lines){await w(Math.max(0,(l.t-last)*S*1000));last=l.t;const d=document.createElement('div');
      d.innerHTML=l.h||'&nbsp;';o.appendChild(d);o.scrollTop=o.scrollHeight;}await w(Math.max(0,(b.real-last)*S*1000)+150);}
      window.__done=true;})();
    </script>`,
  );
  return "file://" + f;
}

// ---------- Chrome + DevTools Protocol ----------
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, ko } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? ko(new Error(msg.error.message)) : ok(msg.result);
      } else if (msg.method) this.handlers.get(msg.method)?.(msg.params);
    };
  }
  open() {
    return new Promise((ok, ko) => ((this.ws.onopen = ok), (this.ws.onerror = ko)));
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, ko) => this.pending.set(id, { ok, ko }));
  }
  on(method, fn) {
    this.handlers.set(method, fn);
  }
}

const KEYS = {
  KeyW: ["w", 87], KeyA: ["a", 65], KeyS: ["s", 83], KeyD: ["d", 68], KeyE: ["e", 69], KeyF: ["f", 70], KeyP: ["p", 80],
  Space: [" ", 32], ShiftLeft: ["Shift", 16], ArrowLeft: ["ArrowLeft", 37], ArrowRight: ["ArrowRight", 39],
  Enter: ["Enter", 13], Escape: ["Escape", 27],
};

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome/Chromium not found (set CHROME_PATH)");
  const ff = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (!/libx264/.test(ff.stdout ?? "")) throw new Error("ffmpeg with libx264 is required");

  // Terminal scenes that do not depend on the recording: run them first (the bench opens its own Chrome window).
  const T = {};
  if (!QUICK) {
    log("npm test …");
    T.test = [await capture("npm test")];
    log("headless …");
    T.headless = [
      await capture(
        "node dist-headless/headless/cli.js --seed 7 --night 1 --ticks 21600 --inputs public/replays/n1-seed7-win.inputs.json --out demo-out/n1.jsonl && tail -1 demo-out/n1.jsonl",
      ),
      await capture(
        "node dist-headless/headless/cli.js --seed 7 --night 3 --ticks 21600 --inputs public/replays/n3-seed7-win.inputs.json --out demo-out/a.jsonl && node dist-headless/headless/cli.js --seed 7 --night 3 --ticks 21600 --inputs public/replays/n3-seed7-win.inputs.json --out demo-out/b.jsonl && tail -1 demo-out/a.jsonl && cmp demo-out/a.jsonl demo-out/b.jsonl && echo 'chạy 2 lần: giống từng byte'",
      ),
    ];
    log("bench (30 s, own Chrome window) …");
    T.bench = [await capture("node dist-headless/app/bench.js --seed 42 --duration 30 --out demo-out/bench.json")];
    T.harness = [
      await capture("wc -l CLAUDE.md && sed -n 11,20p CLAUDE.md"),
      await capture("cat .claude/settings.json | head -20 && ls .claude/hooks .claude/skills"),
      await capture("git log --oneline | head -14 && git tag -n1"),
    ];
  }

  // run_cmd serves the game + on-disk leaderboard (fresh data dir: only what the video saves)
  const server = spawn("node", ["dist-headless/app/run.js", "--no-open", "--port", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, DDL_DATA_DIR: DATA },
    stdio: "ignore",
  });
  const GAME = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(GAME)).ok) break;
    } catch {}
    await sleep(100);
  }

  const profile = join(WORK, "profile");
  const browser = spawn(
    chrome,
    [
      `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
      "--password-store=basic", "--use-mock-keychain", `--remote-debugging-port=${CDP_PORT}`, "--app=about:blank",
      "--window-size=1280,760", "--window-position=30,30", "--ignore-gpu-blocklist", "--allow-file-access-from-files",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--autoplay-policy=no-user-gesture-required",
    ],
    { stdio: "ignore" },
  );
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!wsUrl) await sleep(150);
  }
  if (!wsUrl) throw new Error("no DevTools page target");
  const cdp = new Cdp(wsUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const evalJs = async (expression) =>
    (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const poll = async (expression, timeoutMs, everyMs = 250) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await evalJs(expression).catch(() => false)) return true;
      await sleep(everyMs);
    }
    return false;
  };
  const go = async (url, settleMs = 600) => {
    await cdp.send("Page.navigate", { url });
    await sleep(settleMs);
  };
  const key = async (code, type) => {
    const [k, vk] = KEYS[code];
    await cdp.send("Input.dispatchKeyEvent", {
      type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
      ...(type === "keyDown" && k.length === 1 ? { text: k } : {}),
    });
  };
  const tap = async (code, holdMs = 90) => {
    await key(code, "keyDown");
    await sleep(holdMs);
    await key(code, "keyUp");
  };
  const hold = async (codes, ms) => {
    for (const c of codes) await key(c, "keyDown");
    await sleep(ms);
    for (const c of codes) await key(c, "keyUp");
  };
  const click = (sel) => evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`);
  const card = async (name, title, lines, ms = 4200, kicker) => {
    await go(cardPage(name, title, lines, kicker), 0);
    await sleep(ms);
  };
  const terminal = async (name, title, blocks, seconds) => {
    await go(terminalPage(name, title, blocks, seconds), 0);
    await poll("window.__done === true", (seconds + 30) * 1000, 200);
    await sleep(2200);
  };

  // ---------- recording ----------
  const frames = [];
  cdp.on("Page.screencastFrame", (p) => {
    const f = join(FRAMES, `f${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(f, Buffer.from(p.data, "base64"));
    frames.push({ f, t: p.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  });
  await go(cardPage("c0", "Đảo Đèn Lồng", []), 300);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  const tStart = Date.now();

  await card("c1", "Đảo Đèn Lồng — v1.0.0", [
    "Game 3D góc nhìn thứ ba: thắp đèn lồng, giữ đảo sáng tới bình minh",
    "TypeScript + Three.js · chế độ headless theo Test Contract v1.3",
    "Video: chơi trực tiếp · cài đặt trợ năng · bảng xếp hạng · test · headless · benchmark · soak · harness",
  ], 6500, "Lab Day 12 · AI SDLC · demo");

  // 1. live play (real key events)
  await card("c2", "Chơi trực tiếp — Đêm 1", ["Phím thật gửi vào game: W A S D, ← →, Space, Shift (lướt), F (Tỏa Sáng)", "Phụ đề + mũi tên ở mép màn hình khi Bóng Mực xuất hiện"], 3800);
  await go(GAME + "?seed=11", 1800);
  await click('button[data-act="start"]');
  await sleep(2600);
  await tap("Enter");
  await sleep(1200);
  await hold(["KeyW"], 1800);
  await hold(["KeyW", "ArrowLeft"], 1200);
  await hold(["KeyW"], 1500);
  await tap("Space");
  await hold(["KeyW"], 600);
  await tap("ShiftLeft");
  await hold(["KeyD", "ArrowRight"], 1500);
  await hold(["KeyW"], 1600);
  await poll("!!document.querySelector('#captions .cap')", 6000);
  await hold(["ArrowLeft"], 1400);
  await hold(["KeyW", "ArrowRight"], 2000);
  await tap("KeyF");
  await sleep(1500);
  await tap("KeyP"); // pause screen
  await sleep(2500);
  await tap("KeyP");
  await sleep(500);
  if (!QUICK) {
    // run off the island until the last Ngọn Lửa is gone → loss screen with the name form
    for (let i = 0; i < 8 && !(await evalJs("!!document.getElementById('save-form')")); i++) await hold(["KeyW"], 4000);
    await poll("!!document.getElementById('save-form')", 20000);
    await sleep(2500);
    await evalJs("document.querySelector('#save-form input').focus()");
    for (const ch of "Mây_Demo") {
      await cdp.send("Input.insertText", { text: ch });
      await sleep(140);
    }
    await sleep(600);
    await tap("Enter");
    await sleep(2200);
    await click("#save-form button");
    await sleep(4200);
  }

  // 2. settings: key remapping with a conflict, large text
  await card("c3", "Cài đặt & trợ năng", ["Đổi phím 9 hành động: phím trùng bị từ chối và nêu tên hành động", "Chữ UI tối thiểu 18 px, tùy chọn chữ lớn ×1.25 · giảm chuyển động · phụ đề"], 3600);
  await go(GAME, 1500);
  await click('button[data-act="settings"]');
  await sleep(1800);
  await click('button.key[data-key="dash"]');
  await sleep(900);
  await tap("KeyE"); // refused: E is "Tương tác"; the capture ends with the message (no Esc: it would close Settings)
  await sleep(3400);
  await click("#lg");
  await sleep(1400);
  await click('button[data-act="back"]');
  await sleep(2600);
  await click('button[data-act="settings"]');
  await sleep(700);
  await click("#lg");
  await click('button[data-act="back"]');
  await sleep(800);

  // 3. a whole night through the game, bot inputs
  await card("c4", "Đêm 1 trọn vẹn tới bình minh", ["Inputs của bot (chơi qua đúng sim headless) phát lại trong game 3D, tua ×6", "Điểm trên màn kết quả phải bằng dòng end của CLI headless (xem phần sau)"], 4000);
  await go(GAME + `?seed=7&night=1&replay=replays/n1-seed7-win.inputs.json&speed=${QUICK ? 12 : 6}`, 500);
  await poll("/Điểm Đêm/.test(document.body.innerText)", 90000, 300);
  await sleep(5000);

  if (!QUICK) {
    await card("c5", "Đêm 3 — Đảo Chuông", ["3 tầng, dốc, bục nhảy, tháp chuông, gió mạnh (báo trước 2 s)", "Inputs của bot, tua ×6"], 3200);
    await go(GAME + "?seed=7&night=3&replay=replays/n3-seed7-win.inputs.json&speed=6", 500);
    await sleep(17000);

    // 4. leaderboard export of what was just saved
    await card("c6", "Bảng xếp hạng trên đĩa + soak test", ["run_cmd --export-leaderboard: tên vừa nhập trong video", "soak_cmd: 10 Đêm liên tiếp, input ngẫu nhiên, 0 crash"], 1000);
    T.board = [
      await capture("node dist-headless/app/run.js --export-leaderboard demo-out/out.json && cat demo-out/out.json"),
      await capture("node --expose-gc dist-headless/headless/soak.js --seed 7 --nights 10 --out demo-out/soak.json"),
    ];
    await sleep(2500);

    await card("c7", "Kiểm thử tự động", ["npm test: build headless + vitest, chạy CLI end-to-end", "AC Phase 1–4: luật, tất định, bench scene, soak, bảng xếp hạng, đổi phím"], 3400);
    await terminal("t1", "npm test", T.test, 16);
    await card("c8", "Chế độ headless (Test Contract v1.3)", ["Replay Đêm 1 của bot qua CLI: điểm = màn kết quả trong game", "Đêm 3 chạy 2 lần: đầu ra giống từng byte"], 3400);
    await terminal("t2", "headless_cmd", T.headless, 12);
    await card("c9", "Benchmark (bench_cmd)", ["Cửa sổ 1280×720, tắt vsync, Đêm 1 + 200 Bóng Mực + 100 đom đóm", "Camera bay vòng r 30 m, Y 15 m, 15 s/vòng; bỏ 3 s khởi động, đo 30 s"], 3400);
    await go(GAME + "?bench=42&duration=600", 0);
    await sleep(10000);
    await terminal("t3", "bench_cmd --seed 42 --duration 30", T.bench, 12);
    await terminal("t4", "run_cmd --export-leaderboard · soak_cmd", T.board, 12);
    await card("c10", "Harness AI", ["CLAUDE.md < 50 dòng · hook Stop chặn kết thúc khi test đỏ", "skill play-and-capture · git log nhỏ, mỗi phase một tag"], 3200);
    await terminal("t5", "harness · git", T.harness, 14);
    await card("c11", "Kết quả", [
      "Test 175/175 · headless tất định · bot thắng cả 3 Đêm",
      "Bench: xem bench.json (≥ 60 FPS, 1% low ≥ 30) · Soak: 0 crash; RSS ×1.37 (> 1.2, giải thích trong repo)",
      "Release v1.0.0: dao-den-long-v1.0.0-web.zip → node run.js",
    ], 6500);
  }

  await cdp.send("Page.stopScreencast");
  await sleep(300);
  log(`recorded ${frames.length} frames over ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
  browser.kill();
  server.kill();

  // ---------- encode at real timestamps ----------
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - frames[i].t) : 1;
    list.push(`file '${frames[i].f}'`, `duration ${d.toFixed(4)}`);
  }
  list.push(`file '${frames[frames.length - 1].f}'`);
  writeFileSync(join(WORK, "list.txt"), list.join("\n") + "\n");
  mkdirSync(resolve(OUT, ".."), { recursive: true });
  const enc = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(WORK, "list.txt"),
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-movflags", "+faststart", OUT],
    { stdio: "inherit" },
  );
  if (enc.status !== 0) throw new Error("ffmpeg failed");
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "csv=p=0", OUT], { encoding: "utf8" });
  log(`${OUT}: ${probe.stdout.trim()} (duration s, bytes)`);
  rmSync(WORK, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
