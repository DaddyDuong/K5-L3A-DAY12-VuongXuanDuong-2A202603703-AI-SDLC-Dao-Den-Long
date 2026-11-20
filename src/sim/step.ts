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

  // TODO(phase-1 rules): deposit/lantern_lit, shades chase/hit, pulse, win check.

  w.steps++;
  w.prevInput = { ...input, move: [...input.move] };

  if (timeLeftS(w) <= 0) {
    w.state = "lost";
    events.push({ name: "game_over", data: { result: "lost", reason: "dawn" } });
  }
  return events;
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
