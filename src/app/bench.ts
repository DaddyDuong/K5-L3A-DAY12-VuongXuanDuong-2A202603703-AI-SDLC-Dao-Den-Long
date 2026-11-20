#!/usr/bin/env node
// `bench_cmd` (Test Contract v1.3, Ticket-04 §1): `node dist-headless/app/bench.js --seed 42 --duration 30 --out bench.json`
// Serves dist-web, opens the installed Chrome/Chromium as a 1280×720 app window with vsync off, the page plays the
// standard bench scene (?bench=…) and posts its frame times back; this process computes the numbers, samples the RSS of
// its whole process tree, writes bench.json, closes the browser and exits 0. See docs/notes/phase-4-assumptions.md ADR-004.
// Exit codes: 0 ok, 1 bad arguments / no browser / timeout / IO error.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { arch, cpus, release, tmpdir, totalmem, type as osType } from "node:os";
import { delimiter, join } from "node:path";
import { BENCH, frameStats } from "../sim/bench.js";
import { readBody, sendJson, startServer, webDir } from "./server.js";

const USAGE = "usage: bench --seed <int> --duration <seconds> --out bench.json";
const T0 = performance.timeOrigin; // epoch ms when this process started (P4-A4)

interface PageReport {
  dts: number[];
  firstFrameEpoch: number;
  measureStartEpoch: number;
  measureEndEpoch: number;
  gl: string;
  three: string;
  ua: string;
  inner: [number, number];
  canvas: [number, number];
  dpr: number;
}

function parseArgs(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]!;
    const v = argv[i + 1];
    if (!k.startsWith("--") || v === undefined) throw new Error(`bad argument '${k}'`);
    o[k.slice(2)] = v;
  }
  if (!/^-?\d+$/.test(o.seed ?? "")) throw new Error("--seed must be an integer");
  const duration = Number(o.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("--duration must be a positive number of seconds");
  if (!o.out) throw new Error("--out is required");
  return { seed: Number(o.seed), duration, out: o.out };
}

/** Installed Chromium-family browser: $CHROME_PATH, then the usual names / install paths. */
export function findChrome(): string | null {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  if (process.platform === "darwin") {
    return (
      ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"]
        .map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`)
        .find((p) => existsSync(p)) ?? null
    );
  }
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[];
    const rel = ["Google\\Chrome\\Application\\chrome.exe", "Microsoft\\Edge\\Application\\msedge.exe", "Chromium\\Application\\chrome.exe"];
    return roots.flatMap((r) => rel.map((x) => join(r, x))).find((p) => existsSync(p)) ?? null;
  }
  const names = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser", "brave"];
  const dirs = (process.env.PATH ?? "").split(delimiter);
  for (const n of names) for (const d of dirs) if (d && existsSync(join(d, n))) return join(d, n);
  return null;
}

/** RSS (MB) of this process and all its descendants, or null where `ps` is unavailable (Windows). P4-A5. */
function treeRssMb(): number | null {
  if (process.platform === "win32") return null;
  const r = spawnSync("ps", ["-A", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const kids = new Map<number, number[]>();
  const rss = new Map<number, number>();
  for (const line of r.stdout.split("\n")) {
    const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
    if (!pid || ppid === undefined || kb === undefined) continue;
    rss.set(pid, kb);
    kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
  }
  let total = 0;
  const stack = [process.pid];
  const seen = new Set<number>();
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    total += rss.get(p) ?? 0;
    stack.push(...(kids.get(p) ?? []));
  }
  return total / 1024;
}

function machine(): string {
  const c = cpus();
  return `${osType()} ${release()} ${arch()} · ${c[0]?.model.trim() ?? "CPU"} (${c.length} luồng) · ${Math.round(totalmem() / 2 ** 30)} GB RAM`;
}

async function main(): Promise<number> {
  let o: ReturnType<typeof parseArgs>;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n${USAGE}\n`);
    return 1;
  }
  if (!existsSync(join(webDir(), "index.html"))) {
    process.stderr.write(`error: ${webDir()} has no index.html — run "npm run build" first\n`);
    return 1;
  }
  const chrome = findChrome();
  if (!chrome) {
    process.stderr.write("error: no Chrome/Chromium/Edge/Brave found — install one or set CHROME_PATH\n");
    return 1;
  }

  let report: PageReport | null = null;
  let finish: () => void = () => {};
  const done = new Promise<void>((ok) => (finish = ok));
  const onReport = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      report = JSON.parse(await readBody(req)) as PageReport;
      sendJson(res, 200, { ok: true });
      finish();
    } catch (e) {
      sendJson(res, 400, { error: (e as Error).message });
    }
  };
  const { server, url } = await startServer({ "/api/bench": onReport }, 4190);

  // Memory: sample the whole tree every 250 ms; keep the samples taken inside the measured window.
  const samples: { t: number; mb: number }[] = [];
  const sampler = setInterval(() => {
    const mb = treeRssMb();
    if (mb !== null) samples.push({ t: Date.now(), mb });
  }, 250);

  const profile = mkdtempSync(join(tmpdir(), "ddl-bench-"));
  const pageUrl = `${url}?bench=${o.seed}&duration=${o.duration}`;
  const flags = [
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-sync",
    "--password-store=basic",
    "--use-mock-keychain",
    `--app=${pageUrl}`,
    "--window-size=1280,720",
    "--window-position=40,40",
    "--force-device-scale-factor=1",
    // P4-A2: vsync off and no frame cap; never throttle an occluded / background window.
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--ignore-gpu-blocklist",
  ];
  const browser: ChildProcess = spawn(chrome, flags, { stdio: "ignore" });
  let browserExited = false;
  browser.on("exit", () => (browserExited = true));
  console.log(`bench: ${chrome}\nbench: ${pageUrl}`);

  const limitMs = (BENCH.warmupMs / 1000 + o.duration + 90) * 1000;
  const timedOut = await Promise.race([done.then(() => false), new Promise<boolean>((ok) => setTimeout(() => ok(true), limitMs))]);
  clearInterval(sampler);
  if (!browserExited) browser.kill("SIGTERM");
  server.close();
  await new Promise((ok) => setTimeout(ok, 500));
  rmSync(profile, { recursive: true, force: true });

  const r = report as PageReport | null;
  if (timedOut || !r) {
    process.stderr.write(`error: no result from the page within ${Math.round(limitMs / 1000)} s\n`);
    return 1;
  }
  const inWindow = samples.filter((s) => s.t >= r.measureStartEpoch - 250 && s.t <= r.measureEndEpoch + 250);
  const peak = inWindow.length ? Math.max(...inWindow.map((s) => s.mb)) : null;
  const stats = frameStats(r.dts);
  const chromeVer = /(?:Chrome|Chromium|Edg)\/([\d.]+)/.exec(r.ua)?.[0] ?? r.ua;
  const out = {
    contract_version: "1.3",
    avg_fps: stats.avg_fps,
    p1_low_fps: stats.p1_low_fps,
    frame_ms_p95: stats.frame_ms_p95,
    frames: stats.frames,
    load_ms: Math.round(r.firstFrameEpoch - T0),
    peak_mem_mb: peak === null ? null : Math.round(peak),
    vsync_off: true,
    renderer: `Three.js r${r.three} · WebGL2 · ${r.gl} · ${chromeVer} (--disable-gpu-vsync --disable-frame-rate-limit)`,
    os: machine(),
  };
  try {
    writeFileSync(o.out, JSON.stringify(out, null, 2) + "\n");
  } catch (e) {
    process.stderr.write(`error: cannot write '${o.out}': ${(e as Error).message}\n`);
    return 1;
  }
  const pass = out.avg_fps >= 60 && out.p1_low_fps >= 30 && out.load_ms <= 10000;
  console.log(JSON.stringify(out));
  console.log(
    `bench: page ${r.inner[0]}×${r.inner[1]}, canvas ${r.canvas[0]}×${r.canvas[1]} @${r.dpr}x, ${inWindow.length} memory samples` +
      `\n${pass ? "PASS" : "FAIL"} (máy này): avg_fps ≥ 60, p1_low_fps ≥ 30, load_ms ≤ 10000`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    process.stderr.write(`error: ${e.stack ?? e.message}\n`);
    process.exit(1);
  },
);
