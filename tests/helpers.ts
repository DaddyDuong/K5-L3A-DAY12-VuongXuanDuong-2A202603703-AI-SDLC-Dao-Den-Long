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
