// Snapshot line, Test Contract v1.1 (v1.0 fields + Ticket-02 additions). Only contract fields (A25).
import { WORLD } from "./tuning.js";
import type { Vec3, World } from "./types.js";
import { round3, timeLeftS } from "./world.js";

const v3 = (p: Vec3): Vec3 => [round3(p[0]), round3(p[1]), round3(p[2])];
const secs = (ticks: number) => round3(ticks / WORLD.tick_rate);

export function snapshot(w: World) {
  const p = w.player;
  return {
    type: "snapshot",
    tick: w.steps,
    sim_tick: w.simTicks,
    night: w.map.night,
    state: w.state,
    time_left_s: round3(timeLeftS(w)),
    score: w.score,
    wind: { active: w.wind.active, dir_deg: w.wind.dirDeg },
    player: {
      pos: v3(p.pos),
      vel: v3(p.vel),
      grounded: p.grounded,
      flames: p.flames,
      carried: p.carried,
      invuln: p.invulnTicks > 0,
      dash_cd_s: secs(p.dashCdTicks),
      pulse_cd_s: secs(p.pulseCdTicks),
      charm_s: secs(p.charmTicks),
    },
    lanterns: w.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: w.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: w.motes.length,
    motes: w.motes.map((m) => ({ id: m.id, pos: v3(m.pos), kind: m.kind, ttl_s: m.ttl === null ? null : secs(m.ttl) })),
    drifters: w.drifters.map((d) => ({ id: d.id, pos: v3(d.pos), state: d.state, stolen: d.stolen })),
    charms: w.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: secs(c.available ? 0 : c.respawnTicks) })),
  };
}
