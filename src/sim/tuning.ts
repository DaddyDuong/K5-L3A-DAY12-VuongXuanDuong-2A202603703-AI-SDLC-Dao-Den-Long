// Single source of truth for gameplay numbers.
// `TUNING` must stay identical to `tuning` in game.contract.json (enforced by tests/contract.test.ts).
export const TUNING = {
  player_speed: 6,
  carry_capacity: 5,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1.5,
  interact_radius: 2.5,
  pulse_cost: 1,
  pulse_radius: 6,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 4,
  pulse_cooldown_s: 1,
  safe_radius: 5,
  shade_speed: 3.5,
  shade_hit_radius: 1,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 25,
    per_second_left: 2,
    per_flame_left: 50,
  },
} as const;

// Internal world constants (not part of the contract).
export const WORLD = {
  tick_rate: 60,
  island_radius: 40,
  lantern_ring_radius: 25,
  mote_count_night1: 40, // W3
  gravity: 20,
  jump_velocity: 7,
  shade_initial_count: 3, // R4
  shade_spawn_interval_s: 30, // R4
  shade_max: 8, // R4
  shade_spawn_radius: 38, // R4
  shade_spawn_jitter_deg: 45, // R4
  shade_y: 1, // R4: shade.pos is its centre
  drop_scatter_radius: 3, // R7: dropped motes land outside pickup_radius
} as const;

export type Tuning = typeof TUNING;
