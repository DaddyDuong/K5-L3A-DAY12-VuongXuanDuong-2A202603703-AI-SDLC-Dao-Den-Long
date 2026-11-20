import { worldMove } from "./inputs.js";
import { TUNING, WORLD } from "./tuning.js";
import type { InputState, SimEvent, Vec3, World } from "./types.js";
import { spawnShadeOnRim, timeLeftS } from "./world.js";

const DT = 1 / WORLD.tick_rate;

/** Advance the world by exactly one tick. Returns events produced in this step. */
export function step(w: World, input: InputState): SimEvent[] {
  const events: SimEvent[] = [];
  if (w.state !== "playing") return events;
  const t = w.steps + 1; // tick number of the state this step produces

  const prev = w.prevInput;
  const pressed = (b: "jump" | "interact" | "pulse" | "dash") => input[b] && !prev[b];
  const p = w.player;

  // Movement on XZ (contract §C).
  const [dx, dz] = worldMove(input);
  p.pos[0] += dx * TUNING.player_speed * DT;
  p.pos[2] += dz * TUNING.player_speed * DT;

  // Jump + gravity.
  const grounded = p.pos[1] <= 0 && p.vy <= 0;
  if (pressed("jump") && grounded) p.vy = WORLD.jump_velocity;
  p.vy -= WORLD.gravity * DT;
  p.pos[1] += p.vy * DT;
  if (p.pos[1] <= 0) {
    p.pos[1] = 0;
    p.vy = 0;
  }

  // Island edge: fall_enabled = false -> invisible wall at the island radius.
  const r = Math.hypot(p.pos[0], p.pos[2]);
  if (r > WORLD.island_radius) {
    p.pos[0] *= WORLD.island_radius / r;
    p.pos[2] *= WORLD.island_radius / r;
  }

  pickupMotes(w, events);
  if (pressed("interact")) deposit(w, events);

  if (pressed("pulse")) pulse(w, t, events);
  moveShades(w, t);
  checkHits(w, t, events);
  spawnShades(w, t, events);

  w.steps++;
  w.prevInput = { ...input, move: [...input.move] };
  checkGameOver(w, events);
  return events;
}

/** R10/R11/R12: win is checked first, then no_flames, then dawn. */
function checkGameOver(w: World, events: SimEvent[]): void {
  if (w.lanterns.every((l) => l.lit)) {
    w.state = "won";
    w.score +=
      TUNING.score.per_second_left * Math.floor(timeLeftS(w)) + TUNING.score.per_flame_left * w.player.flames;
    events.push({ name: "game_over", data: { result: "won", reason: "all_lit" } });
  } else if (w.player.flames <= 0) {
    w.state = "lost";
    events.push({ name: "game_over", data: { result: "lost", reason: "no_flames" } });
  } else if (timeLeftS(w) <= 0) {
    w.state = "lost";
    events.push({ name: "game_over", data: { result: "lost", reason: "dawn" } });
  }
}

/** R2/R3: deposit into the nearest unlit lantern in interact_radius (ties -> lower id). */
function deposit(w: World, events: SimEvent[]): void {
  const p = w.player;
  if (p.carried <= 0) return;
  let target: World["lanterns"][number] | undefined;
  let best = Infinity;
  for (const l of w.lanterns) {
    const d = distXZ(p.pos, l.pos);
    if (!l.lit && d <= TUNING.interact_radius && d < best) {
      best = d;
      target = l;
    }
  }
  if (!target) return;
  const amount = Math.min(p.carried, Math.max(0, TUNING.lantern_cost - target.deposited));
  if (amount > 0) {
    p.carried -= amount;
    target.deposited += amount;
    events.push({ name: "deposit", data: { lantern_id: target.id, amount, deposited: target.deposited } });
  }
  if (target.deposited >= TUNING.lantern_cost) {
    target.lit = true;
    w.score += TUNING.score.per_lantern;
    events.push({ name: "lantern_lit", data: { lantern_id: target.id } });
  }
}

/** XZ-plane distance (contract §B). */
export function distXZ(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
}

/** R1: auto-pickup every mote within pickup_radius, in id order, until the bag is full. */
function pickupMotes(w: World, events: SimEvent[]): void {
  const p = w.player;
  w.motes = w.motes.filter((m) => {
    if (p.carried >= TUNING.carry_capacity || distXZ(p.pos, m.pos) > TUNING.pickup_radius) return true;
    p.carried++;
    w.score += TUNING.score.per_mote;
    events.push({ name: "mote_picked", data: { carried: p.carried } });
    return false;
  });
}

/** R5/R6/R9: stun expiry, chase, keep out of lit-lantern safe zones and inside the island. */
function moveShades(w: World, t: number): void {
  const p = w.player.pos;
  for (const s of w.shades) {
    if (s.state === "stunned" && t >= s.stunUntil) s.state = "chase";
    if (s.state === "chase") {
      const dx = p[0] - s.pos[0];
      const dz = p[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      const stepLen = Math.min(TUNING.shade_speed * DT, d);
      if (d > 0) {
        s.pos[0] += (dx / d) * stepLen;
        s.pos[2] += (dz / d) * stepLen;
      }
    }
    constrainShade(w, s.pos);
  }
}

const SAFE_EPS = 0.01; // shades stop just outside safe_radius so "within r" (<= r) never holds

/** Push a shade position out of every lit lantern's safe zone and back onto the island. */
export function constrainShade(w: World, pos: Vec3): void {
  for (const l of w.lanterns) {
    if (!l.lit) continue;
    const dx = pos[0] - l.pos[0];
    const dz = pos[2] - l.pos[2];
    const d = Math.hypot(dx, dz);
    if (d <= TUNING.safe_radius) {
      const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0];
      pos[0] = l.pos[0] + ux * (TUNING.safe_radius + SAFE_EPS);
      pos[2] = l.pos[2] + uz * (TUNING.safe_radius + SAFE_EPS);
    }
  }
  const r = Math.hypot(pos[0], pos[2]);
  if (r > WORLD.island_radius) {
    pos[0] *= WORLD.island_radius / r;
    pos[2] *= WORLD.island_radius / r;
  }
}

/** R4: one new shade every shade_spawn_interval_s while below shade_max. */
function spawnShades(w: World, t: number, events: SimEvent[]): void {
  if (!w.randomShades || t % (WORLD.shade_spawn_interval_s * WORLD.tick_rate) !== 0) return;
  if (w.shades.length >= WORLD.shade_max) return;
  const s = spawnShadeOnRim(w, Math.PI);
  events.push({ name: "shade_spawned", data: { id: s.id } });
}

/** R7: first non-stunned shade within shade_hit_radius hits a non-invulnerable player (max one hit per tick). */
function checkHits(w: World, t: number, events: SimEvent[]): void {
  if (t < w.invulnUntil) return;
  const p = w.player;
  const hitter = w.shades.find((s) => s.state !== "stunned" && distXZ(s.pos, p.pos) <= TUNING.shade_hit_radius);
  if (!hitter) return;
  p.flames = Math.max(0, p.flames - 1);
  const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
  p.carried -= dropped;
  for (let i = 0; i < dropped; i++) {
    const a = (2 * Math.PI * i) / dropped;
    const pos: Vec3 = [
      p.pos[0] + WORLD.drop_scatter_radius * Math.sin(a),
      0,
      p.pos[2] + WORLD.drop_scatter_radius * Math.cos(a),
    ];
    const r = Math.hypot(pos[0], pos[2]);
    if (r > WORLD.island_radius) {
      pos[0] *= WORLD.island_radius / r;
      pos[2] *= WORLD.island_radius / r;
    }
    w.motes.push({ id: `M${w.nextMoteId++}`, pos });
  }
  w.invulnUntil = t + Math.round(TUNING.invuln_s * WORLD.tick_rate);
  events.push({ name: "player_hit", data: { by: "shade", flames: p.flames, dropped } });
}

/** R8/R9: spend pulse_cost motes to stun + push every shade within pulse_radius. */
function pulse(w: World, t: number, events: SimEvent[]): void {
  const p = w.player;
  if (p.carried < TUNING.pulse_cost || t < w.pulseReadyAt) return;
  p.carried -= TUNING.pulse_cost;
  w.pulseReadyAt = t + Math.round(TUNING.pulse_cooldown_s * WORLD.tick_rate);
  const stunned: string[] = [];
  for (const s of w.shades) {
    const dx = s.pos[0] - p.pos[0];
    const dz = s.pos[2] - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > TUNING.pulse_radius) continue;
    if (s.state !== "stunned") w.score += TUNING.score.per_stun;
    s.state = "stunned";
    s.stunUntil = t + Math.round(TUNING.pulse_stun_s * WORLD.tick_rate);
    const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0];
    s.pos[0] += ux * TUNING.pulse_push_m;
    s.pos[2] += uz * TUNING.pulse_push_m;
    constrainShade(w, s.pos);
    stunned.push(s.id);
  }
  events.push({ name: "pulse", data: { stunned_ids: stunned } });
}
