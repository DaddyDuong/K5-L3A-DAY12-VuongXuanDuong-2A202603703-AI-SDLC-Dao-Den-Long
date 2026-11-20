#!/usr/bin/env node
// Soak test, Test Contract v1.3 (Ticket-04 §2): `soak_cmd --seed 7 --nights 10 --out soak.json`.
// Runs the nights back to back in this one process (night 1 → 2 → 3 → 1 …), night i (from 0) with seed + i and
// seeded random input, then reports crashes and RSS. Run with `node --expose-gc` so memory is sampled after a full GC
// (P4-A15). `--trace 1` also prints RSS / JS heap after every night (evidence that memory is flat, not leaking).
// Exit codes: 0 ok (the JSON says whether the thresholds are met), 1 bad arguments / IO error.
import { writeFileSync } from "node:fs";
import { SoakInput } from "../sim/bench.js";
import { snapshot } from "../sim/snapshot.js";
import { step } from "../sim/step.js";
import { WORLD } from "../sim/tuning.js";
import type { World } from "../sim/types.js";
import { createWorld } from "../sim/world.js";

const USAGE = "usage: soak --seed <int> --nights <int ≥ 1> --out soak.json [--trace 1]";

function args(argv: string[]): { seed: number; nights: number; out: string; trace: boolean } {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]!;
    const v = argv[i + 1];
    if (!k.startsWith("--") || v === undefined) throw new Error(`bad argument '${k}'`);
    o[k.slice(2)] = v;
  }
  const int = (k: string, min: number) => {
    if (!/^-?\d+$/.test(o[k] ?? "")) throw new Error(`--${k} must be an integer`);
    const n = Number(o[k]);
    if (n < min) throw new Error(`--${k} must be >= ${min}`);
    return n;
  };
  if (!o.out) throw new Error("--out is required");
  return { seed: int("seed", -2147483648), nights: int("nights", 1), out: o.out, trace: o.trace === "1" };
}

const gc = (globalThis as { gc?: () => void }).gc;
const rssMb = () => {
  gc?.();
  gc?.();
  return Math.round((process.memoryUsage().rss / 2 ** 20) * 10) / 10;
};

/** One night until it ends (at most its standard duration), producing the same lines as the CLI and dropping them. */
function playNight(w: World, seed: number): "won" | "lost" {
  const input = new SoakInput(seed);
  const limit = w.map.duration_s * WORLD.tick_rate;
  let bytes = 0;
  for (let k = 0; k < limit && (w.state === "playing" || w.state === "paused"); k++) {
    for (const e of step(w, input.at(k))) bytes += JSON.stringify({ type: "event", tick: k + 1, name: e.name, data: e.data }).length;
    if ((k + 1) % 10 === 0) bytes += JSON.stringify(snapshot(w)).length;
  }
  if (bytes === 0) throw new Error("no output produced");
  if (w.state !== "won" && w.state !== "lost") throw new Error(`night did not end (state ${w.state})`);
  return w.state;
}

function main(): number {
  let o: ReturnType<typeof args>;
  try {
    o = args(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n${USAGE}\n`);
    return 1;
  }
  const t0 = performance.now();
  const results: string[] = [];
  let crashes = 0;
  let memStart = 0;
  let world: World | null = null;
  for (let i = 0; i < o.nights; i++) {
    const seed = o.seed + i;
    const night = (i % 3) + 1;
    try {
      world = createWorld(seed, night);
      if (i === 0) memStart = rssMb(); // after loading the first night
      results.push(playNight(world, seed));
    } catch (e) {
      crashes++;
      results.push("crash");
      process.stderr.write(`night ${i} (night ${night}, seed ${seed}) crashed: ${(e as Error).stack ?? e}\n`);
    }
    world = null; // reset
    if (o.trace) {
      const rss = rssMb();
      const heap = Math.round((process.memoryUsage().heapUsed / 2 ** 20) * 10) / 10;
      process.stdout.write(`night ${String(i).padStart(2)} (night ${night}, seed ${seed}): ${results[i]!.padEnd(5)} rss ${rss} MB  heapUsed ${heap} MB\n`);
    }
  }
  const memEnd = rssMb(); // after the last night is reset
  const report = {
    nights: o.nights,
    crashes,
    results,
    mem_start_mb: memStart,
    mem_end_mb: memEnd,
    duration_s: Math.round((performance.now() - t0) / 100) / 10,
  };
  try {
    writeFileSync(o.out, JSON.stringify(report) + "\n");
  } catch (e) {
    process.stderr.write(`error: cannot write '${o.out}': ${(e as Error).message}\n`);
    return 1;
  }
  const ok = crashes === 0 && memEnd <= 1.2 * memStart;
  process.stdout.write(`${JSON.stringify(report)}\n${ok ? "PASS" : "FAIL"}: crashes=${crashes}, mem_end/mem_start=${(memEnd / memStart).toFixed(3)} (≤ 1.2)${gc ? "" : " — run with --expose-gc"}\n`);
  return 0;
}

process.exitCode = main();
