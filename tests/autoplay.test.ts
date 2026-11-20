// Every night is winnable end-to-end (AC45): a bot plays through the real sim, and its recorded inputs,
// replayed through the headless CLI, reproduce the same win (bot and CLI must agree exactly).
import { describe, expect, it } from "vitest";
import { MAPS } from "../src/sim/maps.js";
import { autoplay } from "../src/tools/autoplay.js";
import { runCli } from "./helpers.js";

// Ticket-03 replaced the win rule (dawn_survived with ≥ ceil(0.6 n) lit, no all_lit), so the bot was rewritten
// (bank motes into unlit lanterns, light them in the final minute) and lighting every lantern is no longer asserted.
// Seed scan 1–48 with the default bot: night 1 48/48, night 2 48/48, night 3 45/48 (docs/notes/phase-3-assumptions.md §6).
const SEEDS = { 1: [1, 7], 2: [1, 7], 3: [1, 7] } as const;

for (const night of [1, 2, 3] as const) {
  describe(`autoplay: default Night ${night} can be won`, () => {
    for (const seed of SEEDS[night]) {
      it(`seed ${seed}: bot wins and the CLI replay of its inputs ends identically`, () => {
        const bot = autoplay(seed, night);
        expect(bot.state).toBe("won");
        const r = runCli(["--seed", String(seed), "--night", String(night), "--ticks", "21600"], { inputs: { frames: bot.frames } });
        expect(r.code).toBe(0);
        expect(r.lines.at(-1)).toEqual({ type: "end", ticks: bot.ticks, state: "won", score: bot.score });
        const over = r.lines.find((l) => l.name === "game_over");
        expect(over!.data).toEqual({ result: "won", reason: "dawn_survived" });
        expect(r.lines.at(-1)!.ticks).toBe(MAPS[night].duration_s * 60); // survived until dawn
      }, 60000);
    }
  });
}
