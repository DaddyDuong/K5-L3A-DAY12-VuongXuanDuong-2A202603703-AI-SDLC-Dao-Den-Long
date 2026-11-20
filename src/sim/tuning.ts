// Single source of truth for gameplay numbers (Ticket-02 "Số liệu chuẩn" + Ticket-03 contract v1.2).
// `TUNING` must stay identical to `tuning` in game.contract.json (enforced by tests/contract.test.ts).
export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 240, // Ticket-03: 240 / 270 / 300 s
  night2_duration_s: 270,
  night3_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  fall_enabled: true,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  // Ticket-03 (contract v1.2): lantern fuel, relight, win ratio, drain, growing capacity.
  fuel_max: 100,
  fuel_decay_per_s: 1.0,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  capacity_max: 20,
  // Ticket-03 §5 replaces the whole score formula (P3-A10).
  score: {
    per_mote: 5, // per mote put into a lantern: first light, relight or refuel
    per_lantern: 100, // first light
    per_relight: 40,
    per_stun: 5, // per shade hit by a pulse, every time
    per_stun_drain: 15, // total for a shade that was draining just before the hit
    per_lit_at_dawn: 50, // win only: each lit lantern at dawn, plus floor(fuel)
    per_second_left: 0, // time bonus removed ("Thưởng thời gian: Bỏ")
    per_flame_left: 50, // win only
  },
} as const;

const TR = 60;
const ticks = (s: number) => Math.round(s * TR);

// Internal world constants (not part of the contract). See docs/notes/phase-2-assumptions.md.
export const WORLD = {
  tick_rate: TR,
  gravity: 20,
  jump_velocity: 7,
  step_up: 0.5, // A4: max climb per tick; higher = wall
  fall_y: -10, // R20
  respawn_wait_ticks: 60, // R20
  invuln_ticks: ticks(TUNING.invuln_s),
  pickup_height: 1.5, // R18
  // Dash (R17)
  dash_ticks: ticks(TUNING.dash_duration_s),
  dash_cd_ticks: ticks(TUNING.dash_cooldown_s),
  // Motes (R19)
  mote_initial: 20,
  mote_cap: 30,
  mote_spawn_every: 240,
  dropped_ttl_ticks: 480,
  drop_ring_min: 1.5,
  drop_ring_max: 2.5,
  // Shades (R21)
  shade_first_spawn_tick: 300,
  shade_first_spawn_count: 2,
  shade_min_spawn_dist: 15, // A14
  shade_detect: 12,
  shade_lose: 18,
  shade_hover: 1, // spawned shades: centre 1 m above ground
  shade_hit_height: 1.5,
  shade_spawning_ticks: 30, // A8
  shade_wander_speed: 1.5, // A9
  wander_retarget_ticks: 240, // A9
  recoil_ticks: 60,
  recoil_m: 2,
  stun_ticks: ticks(TUNING.pulse_stun_s),
  push_ticks: 15,
  safe_evict_per_tick: 0.2, // A11: 6 m / 30 ticks
  safe_eps: 0.01,
  // Pulse (R22)
  pulse_center_h: 0.8,
  pulse_cd_ticks: ticks(TUNING.pulse_cooldown_s),
  // Drifters (R24)
  drifter_speed: 7,
  drifter_idle_speed: 2,
  drifter_max: 2,
  drifter_spawn_every: 1200,
  drifter_detect: 15,
  drifter_min_carried: 5,
  drifter_steal_radius: 1.2,
  drifter_steal_max: 3,
  drifter_flee_ticks: 240,
  drifter_drop_vanish_ticks: 120,
  drifter_fly_h: 1.5,
  // Charms (R25)
  charm_ticks: 600,
  charm_respawn_ticks: 2700,
  charm_speed: 7.2,
  // Wind (R26)
  wind_period: 1800,
  wind_duration: 300,
  wind_warn: 120,
  wind_speed: 2,
  // Fuel (Ticket-03 §1): integer units of 1/60 fuel, so 1 unit = decay of one tick.
  fuel_units_per_fuel: TR,
  // x fuel/s = x/60 fuel per tick = x units per tick.
  decay_tick_units: TUNING.fuel_decay_per_s, // 1 unit per tick
  drain_tick_units: TUNING.drain_per_s, // 5 units per tick per draining shade
  fuel_max_units: TUNING.fuel_max * TR,
  fuel_per_mote_units: TUNING.fuel_per_mote * TR,
  low_fuel_units: TUNING.low_fuel_threshold * TR,
  drain_radius: 2, // XZ distance to the lantern to start / keep draining
  drain_chase_radius: 6, // drain -> chase when Mây comes this close
  fuel_drain_event_every: 60,
  capacity_per_light: 2,
} as const;

export type Tuning = typeof TUNING;
