// Night 1 is winnable end-to-end: a bot plays through the real sim, and its recorded inputs,
// replayed through the headless CLI, reproduce the same win (bot and CLI must agree exactly).
import { describe, expect, it } from "vitest";
import { autoplay } from "../src/tools/autoplay.js";
import { runCli } from "./helpers.js";

describe("autoplay: default Night 1 can be won", () => {
  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}: bot wins and the CLI replay of its inputs ends identically`, () => {
      const bot = autoplay(seed);
      expect(bot.state).toBe("won");
      const r = runCli(["--seed", String(seed), "--night", "1", "--ticks", "18000"], { inputs: { frames: bot.frames } });
      expect(r.code).toBe(0);
      expect(r.lines.at(-1)).toEqual({ type: "end", ticks: bot.ticks, state: "won", score: bot.score });
      expect(r.lines.filter((l) => l.name === "lantern_lit")).toHaveLength(5);
    });
  }
});
