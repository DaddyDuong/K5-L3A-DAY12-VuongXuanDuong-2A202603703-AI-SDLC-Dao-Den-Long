import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CLI = "dist-headless/headless/cli.js";

export interface HeadlessResult {
  code: number | null;
  stderr: string;
  raw: string;
  lines: Record<string, any>[];
}

/** Run the built headless CLI. `files` are written to a temp dir and passed by flag name. */
export function runCli(args: string[], files: { inputs?: unknown; scenario?: unknown } = {}): HeadlessResult {
  const dir = mkdtempSync(join(tmpdir(), "ddl-"));
  const out = join(dir, "out.jsonl");
  const extra: string[] = [];
  for (const [k, v] of Object.entries(files)) {
    const p = join(dir, `${k}.json`);
    writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
    extra.push(`--${k}`, p);
  }
  const r = spawnSync("node", [CLI, ...args, ...extra, "--out", out], { encoding: "utf8" });
  let raw = "";
  try {
    raw = readFileSync(out, "utf8");
  } catch {
    /* no output on error */
  }
  const lines = raw.trim() ? raw.trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { code: r.status, stderr: r.stderr, raw, lines };
}

/** Isolated scenario: nothing random unless the test adds it. */
export const scn = (extra: Record<string, unknown>) => ({
  random_motes: false,
  random_shades: false,
  random_drifters: false,
  ...extra,
});

/** Run `ticks` steps of `night` (default 1) with a scenario and optional inputs, snapshot every `every` ticks. */
export const run = (ticks: number, scenario: unknown, inputs?: unknown, every = 1, night = 1, seed = 7) =>
  runCli(["--seed", String(seed), "--night", String(night), "--ticks", String(ticks), "--snapshot-every", String(every)], {
    scenario,
    ...(inputs ? { inputs } : {}),
  });

export const events = (r: HeadlessResult, name: string) => r.lines.filter((l) => l.type === "event" && l.name === name);
export const snap = (r: HeadlessResult, tick: number) => r.lines.find((l) => l.type === "snapshot" && l.tick === tick)!;
export const snaps = (r: HeadlessResult) => r.lines.filter((l) => l.type === "snapshot");
export const press = (button: string, at = 0) => ({ frames: [{ tick: at, [button]: true }] });
export const xz = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
