import type { Vec3, World } from "./types.js";
import { round3, timeLeftS } from "./world.js";

const v3 = (p: Vec3): Vec3 => [round3(p[0]), round3(p[1]), round3(p[2])];

export function snapshot(w: World) {
  return {
    type: "snapshot",
    tick: w.steps,
    sim_tick: w.steps,
    state: w.state,
    time_left_s: round3(timeLeftS(w)),
    score: w.score,
    player: { pos: v3(w.player.pos), flames: w.player.flames, carried: w.player.carried },
    lanterns: w.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: w.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: w.motes.length,
    motes: w.motes.map((m) => ({ id: m.id, pos: v3(m.pos) })),
  };
}
