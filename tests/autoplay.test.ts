// Every night is winnable end-to-end (AC45): a bot plays through the real sim, and its recorded inputs,
// replayed through the headless CLI, reproduce the same win (bot and CLI must agree exactly).
import { describe, expect, it } from "vitest";
import { MAPS } from "../src/sim/maps.js";
import { autoplay } from "../src/tools/autoplay.js";
import { runCli } from "./helpers.js";

// Ticket-03 replaced the win rule (dawn_survived with ≥ ceil(0.6 n) lit, no all_lit), so the bot was rewritten and
// lighting every lantern is no longer asserted. The bot is a proof of winnability, not an optimal player: a scan of
// seeds 1–24 won 18/24 on night 1 and 2/24 on night 2 (seeds 11, 14); night 3 uses seed 1, a known win.
// Weak night 2/3 win rates are recorded in docs/notes/phase-3-assumptions.md §6.
const SEEDS = { 1: [1, 3, 7], 2: [11, 14], 3: [1] } as const;

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
      }, 30000);
    }
  });
}
