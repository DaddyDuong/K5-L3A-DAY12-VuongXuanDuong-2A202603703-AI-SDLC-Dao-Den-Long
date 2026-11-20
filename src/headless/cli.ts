#!/usr/bin/env node
// Headless runner — Test Contract v1.1 (v1.0 §B + Ticket-02 Phần 4).
// Exit codes: 0 ok, 1 bad arguments / IO error, 2 malformed inputs or scenario file.
import { readFileSync, writeFileSync } from "node:fs";
import { MalformedError, parseInputs } from "../sim/inputs.js";
import { runHeadless } from "../sim/run.js";
import { parseScenario } from "../sim/scenario.js";

class UsageError extends Error {}

const USAGE =
  "usage: headless --seed <int> --night <1|2|3> [--scenario f.json] [--inputs f.json] --ticks <int> --out f.jsonl [--snapshot-every <int>]";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new UsageError(`unexpected argument '${a}'`);
    const v = argv[i + 1];
    if (v === undefined) throw new UsageError(`missing value for ${a}`);
    out[a.slice(2)] = v;
    i++;
  }
  return out;
}

function int(args: Record<string, string>, key: string, opts: { required: boolean; min?: number; def?: number }): number {
  const raw = args[key];
  if (raw === undefined) {
    if (opts.required) throw new UsageError(`--${key} is required`);
    return opts.def!;
  }
  if (!/^-?\d+$/.test(raw)) throw new UsageError(`--${key} must be an integer`);
  const n = Number(raw);
  if (opts.min !== undefined && n < opts.min) throw new UsageError(`--${key} must be >= ${opts.min}`);
  return n;
}

function readJson(path: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new UsageError(`cannot read ${what} file '${path}': ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new MalformedError(`${what}: invalid JSON (${(e as Error).message})`);
  }
}

function main(): number {
  try {
    const args = parseArgs(process.argv.slice(2));
    const seed = int(args, "seed", { required: true });
    const night = int(args, "night", { required: true });
    if (night < 1 || night > 3) throw new UsageError(`--night ${night} is not supported (1, 2 or 3)`);
    const ticks = int(args, "ticks", { required: true, min: 0 });
    const snapshotEvery = int(args, "snapshot-every", { required: false, min: 1, def: 10 });
    const out = args.out;
    if (!out) throw new UsageError("--out is required");

    const scenario = args.scenario ? parseScenario(readJson(args.scenario, "scenario"), night) : undefined;
    const inputs = args.inputs ? parseInputs(readJson(args.inputs, "inputs")) : undefined;

    const lines = runHeadless({ seed, night, scenario, inputs, ticks, snapshotEvery });
    writeFileSync(out, lines.join("\n") + "\n");
    return 0;
  } catch (e) {
    if (e instanceof MalformedError) {
      process.stderr.write(`error: ${e.message}\n`);
      return 2;
    }
    if (e instanceof UsageError) {
      process.stderr.write(`error: ${e.message}\n${USAGE}\n`);
      return 1;
    }
    process.stderr.write(`error: ${(e as Error).stack ?? e}\n`);
    return 1;
  }
}

process.exitCode = main();
