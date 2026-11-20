import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TUNING } from "../src/sim/tuning.js";

const contract = JSON.parse(readFileSync("game.contract.json", "utf8"));

describe("game.contract.json (AC22, AC47)", () => {
  // Ticket-03 §7: contract v1.2 replaces v1.1 (phase-3-assumptions.md §1).
  it("has the required top-level fields, contract v1.2", () => {
    expect(contract.contract_version).toBe("1.2");
    for (const k of ["team", "build_cmd", "run_cmd", "headless_cmd"]) {
      expect(typeof contract[k]).toBe("string");
      expect(contract[k].length).toBeGreaterThan(0);
    }
  });

  it("declares exactly the tuning numbers the code uses", () => {
    expect(contract.tuning).toEqual(TUNING);
  });

  // Ticket-03 §7 changes the night durations (300/330/360 -> 240/270/300), adds 8 keys, and §5 replaces the score.
  it("tuning matches Ticket-02 numbers + Ticket-03 'Test Contract v1.2'", () => {
    expect(contract.tuning).toEqual({
      player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1,
      interact_radius: 2, pulse_cost: 3, pulse_radius: 5, night1_duration_s: 240, night2_duration_s: 270,
      night3_duration_s: 300, flames: 3, invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4,
      pulse_cooldown_s: 3, safe_radius: 6, shade_speed: 4, shade_hit_radius: 1, fall_enabled: true,
      dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5,
      fuel_max: 100, fuel_decay_per_s: 1.0, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5,
      low_fuel_threshold: 30, capacity_max: 20,
      score: {
        per_mote: 5, per_lantern: 100, per_relight: 40, per_stun: 5, per_stun_drain: 15, per_lit_at_dawn: 50,
        per_second_left: 0, per_flame_left: 50,
      },
    });
  });

  it("headless_cmd points at the built CLI", () => {
    const script = contract.headless_cmd.split(" ")[1];
    expect(existsSync(script)).toBe(true);
  });
});
