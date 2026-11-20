import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TUNING } from "../src/sim/tuning.js";

const contract = JSON.parse(readFileSync("game.contract.json", "utf8"));

describe("game.contract.json (AC22)", () => {
  it("has the required top-level fields, contract v1.1", () => {
    expect(contract.contract_version).toBe("1.1");
    for (const k of ["team", "build_cmd", "run_cmd", "headless_cmd"]) {
      expect(typeof contract[k]).toBe("string");
      expect(contract[k].length).toBeGreaterThan(0);
    }
  });

  it("declares exactly the tuning numbers the code uses", () => {
    expect(contract.tuning).toEqual(TUNING);
  });

  it("tuning matches Ticket-02 'Số liệu chuẩn' (incl. the 5 new keys)", () => {
    expect(contract.tuning).toEqual({
      player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1,
      interact_radius: 2, pulse_cost: 3, pulse_radius: 5, night1_duration_s: 300, night2_duration_s: 330,
      night3_duration_s: 360, flames: 3, invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4,
      pulse_cooldown_s: 3, safe_radius: 6, shade_speed: 4, shade_hit_radius: 1, fall_enabled: true,
      dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5,
      score: { per_mote: 10, per_lantern: 100, per_stun: 5, per_second_left: 2, per_flame_left: 50 },
    });
  });

  it("headless_cmd points at the built CLI", () => {
    const script = contract.headless_cmd.split(" ")[1];
    expect(existsSync(script)).toBe(true);
  });
});
