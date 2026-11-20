import { worldMove } from "./inputs.js";
import { TUNING, WORLD } from "./tuning.js";
import type { InputState, SimEvent, World } from "./types.js";
import { timeLeftS } from "./world.js";

const DT = 1 / WORLD.tick_rate;

/** Advance the world by exactly one tick. Returns events produced in this step. */
export function step(w: World, input: InputState): SimEvent[] {
  const events: SimEvent[] = [];
  if (w.state !== "playing") return events;

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

  // TODO(phase-1 rules): pulse, shades chase/hit/spawn.

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
