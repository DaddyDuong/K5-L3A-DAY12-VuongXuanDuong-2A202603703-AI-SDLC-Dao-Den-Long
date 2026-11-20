// Every night is winnable end-to-end (AC45): a bot plays through the real sim, and its recorded inputs,
// replayed through the headless CLI, reproduce the same win (bot and CLI must agree exactly).
import { describe, expect, it } from "vitest";
import { MAPS } from "../src/sim/maps.js";
import { autoplay } from "../src/tools/autoplay.js";
import { runCli } from "./helpers.js";

// The bot is a proof of winnability, not an optimal player: on Night 3 (motes are scarce: ~110 spawn for the 70
// needed) it wins 9 of 12 sampled seeds, so that night uses seeds it is known to win.
const SEEDS = { 1: [1, 7, 42], 2: [1, 7, 42], 3: [2, 3, 7] } as const;

for (const night of [1, 2, 3] as const) {
  describe(`autoplay: default Night ${night} can be won`, () => {
    for (const seed of SEEDS[night]) {
      it(`seed ${seed}: bot wins and the CLI replay of its inputs ends identically`, () => {
        const bot = autoplay(seed, night);
        expect(bot.state).toBe("won");
        const r = runCli(["--seed", String(seed), "--night", String(night), "--ticks", "21600"], { inputs: { frames: bot.frames } });
        expect(r.code).toBe(0);
        expect(r.lines.at(-1)).toEqual({ type: "end", ticks: bot.ticks, state: "won", score: bot.score });
        expect(r.lines.filter((l) => l.name === "lantern_lit")).toHaveLength(MAPS[night].lanterns.length);
      }, 30000);
    }
  });
}
