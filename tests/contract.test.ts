import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TUNING } from "../src/sim/tuning.js";

const contract = JSON.parse(readFileSync("game.contract.json", "utf8"));

describe("game.contract.json", () => {
  it("has the required top-level fields", () => {
    expect(contract.contract_version).toBe("1.0");
    for (const k of ["team", "build_cmd", "run_cmd", "headless_cmd"]) {
      expect(typeof contract[k]).toBe("string");
      expect(contract[k].length).toBeGreaterThan(0);
    }
  });

  it("declares exactly the tuning numbers the code uses", () => {
    expect(contract.tuning).toEqual(TUNING);
  });

  it("night 1 has 5 lanterns", () => {
    expect(contract.tuning.lantern_count_night1).toBe(5);
  });

  it("headless_cmd points at the built CLI", () => {
    const script = contract.headless_cmd.split(" ")[1];
    expect(existsSync(script)).toBe(true);
  });
});
