#!/usr/bin/env node
// usage: node dist-headless/tools/autoplay-cli.js --seed <int> [--night 1|2|3] [--out <inputs.json>]
import { writeFileSync } from "node:fs";
import { autoplay } from "./autoplay.js";

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const seed = Number(get("seed") ?? "7");
const night = Number(get("night") ?? "1");
const out = get("out") ?? `public/replays/n${night}-seed${seed}-win.inputs.json`;
const r = autoplay(seed, night);
writeFileSync(out, JSON.stringify({ frames: r.frames }) + "\n");
console.log(JSON.stringify({ seed, night, out, state: r.state, score: r.score, ticks: r.ticks, flames: r.flames, frames: r.frames.length }));
process.exitCode = r.state === "won" ? 0 : 1;
