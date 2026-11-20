#!/usr/bin/env node
// Evidence for Ticket-03 §1 "fuel < 30: lantern and fuel bar blink" in the web build. The current bot lights its
// lanterns in the final minute, so no replay of it ever shows a lantern under 30 fuel; this builds one:
// the pre-rewrite bot (commit 526824a) plays night 1 seed 7 until its first lantern lights, then Mây stands still
// facing that lantern. It burns below 30 (blink, red bar, no safe zone) and shades come to hit her (night is lost).
//
// usage (after npm run build:headless):
//   node scripts/make-lowfuel-evidence.mjs docs/proof/phase-3/lowfuel-blink-n1-seed7.inputs.json
// then copy the file into dist-web/replays/ and open ?seed=7&night=1&replay=replays/lowfuel-blink-n1-seed7.inputs.json
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2] ?? "docs/proof/phase-3/lowfuel-blink-n1-seed7.inputs.json";
const repo = resolve(import.meta.dirname, "..");
const { runHeadless } = await import(pathToFileURL(`${repo}/dist-headless/sim/run.js`).href);

const old = JSON.parse(
  execSync("git show 526824a:public/replays/n1-seed7-win.inputs.json", { cwd: repo, encoding: "utf8" }),
).frames;
const lines = runHeadless({ seed: 7, night: 1, inputs: old, ticks: 21600, snapshotEvery: 1 }).map((l) => JSON.parse(l));
const lit = lines.find((l) => l.name === "lantern_lit");
const snap = lines.find((l) => l.type === "snapshot" && l.tick === lit.tick);
const lantern = snap.lanterns.find((l) => l.id === lit.data.lantern_id);
const p = snap.player.pos;
const yaw = (Math.atan2(lantern.pos[0] - p[0], lantern.pos[2] - p[2]) * 180) / Math.PI;

const frames = old.filter((f) => f.tick < lit.tick);
frames.push({ tick: lit.tick, move: [0, 0], cam_yaw_deg: Math.round(yaw * 1e3) / 1e3, interact: false, pulse: false, dash: false });
writeFileSync(out, JSON.stringify({ frames }) + "\n");

const check = runHeadless({ seed: 7, night: 1, inputs: frames, ticks: 21600, snapshotEvery: 60 }).map((l) => JSON.parse(l));
const low = check.find((l) => l.type === "snapshot" && l.lanterns.some((x) => x.id === lantern.id && x.lit && x.fuel < 30));
console.log(JSON.stringify({
  out,
  lantern: lantern.id,
  litTick: lit.tick,
  below30: { tick: low?.tick, time_left_s: low?.time_left_s },
  firstHit: check.find((l) => l.name === "player_hit")?.tick,
  end: check.at(-1),
}));
