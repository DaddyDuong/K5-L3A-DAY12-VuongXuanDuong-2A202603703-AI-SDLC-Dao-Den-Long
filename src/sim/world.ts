import { Rng } from "./rng.js";
import type { Scenario } from "./scenario.js";
import { TUNING, WORLD } from "./tuning.js";
import { DEFAULT_INPUT, type Lantern, type Mote, type Shade, type Vec3, type World } from "./types.js";

export function defaultLanterns(): Lantern[] {
  const out: Lantern[] = [];
  for (let i = 0; i < TUNING.lantern_count_night1; i++) {
    const a = (i * 2 * Math.PI) / TUNING.lantern_count_night1;
    const r = WORLD.lantern_ring_radius;
    out.push({ id: `L${i + 1}`, pos: [round3(r * Math.sin(a)), 0, round3(r * Math.cos(a))], lit: false, deposited: 0 });
  }
  return out;
}

function randomMotes(rng: Rng, count: number): Vec3[] {
  const out: Vec3[] = [];
  const maxR = WORLD.island_radius - 2;
  while (out.length < count) {
    // Uniform in disk, but not right on top of the spawn point.
    const r = maxR * Math.sqrt(rng.next());
    const a = rng.range(0, 2 * Math.PI);
    if (r < 3) continue;
    out.push([round3(r * Math.sin(a)), 0, round3(r * Math.cos(a))]);
  }
  return out;
}

/** Build the initial world (snapshot tick 0). Scenario setup emits no events and awards no score. */
export function createWorld(seed: number, sc: Scenario = {}): World {
  const rng = new Rng(seed);

  const lanterns = defaultLanterns();
  for (const l of sc.lanterns ?? []) {
    const target = lanterns.find((x) => x.id === l.id)!;
    if (l.pos) target.pos = [...l.pos];
    if (l.lit !== undefined) target.lit = l.lit;
    if (l.deposited !== undefined) target.deposited = l.deposited;
  }

  const motePositions: Vec3[] = [];
  if (sc.random_motes !== false) motePositions.push(...randomMotes(rng, WORLD.mote_count_night1));
  if (sc.motes) {
    // Scenario list replaces the generated list.
    motePositions.length = 0;
    motePositions.push(...sc.motes);
  }
  const motes: Mote[] = motePositions.map((pos, i) => ({ id: `M${i + 1}`, pos: [...pos] }));

  // Phase-1 shade spawning rules are not implemented yet: default list is empty.
  const shades: Shade[] = (sc.shades ?? []).map((s, i) => ({
    id: s.id ?? `S${i + 1}`,
    pos: [...s.pos],
    state: "chase",
  }));

  return {
    steps: 0,
    startTimeLeftS: sc.time_left_s ?? TUNING.night1_duration_s,
    state: "playing",
    score: 0,
    player: {
      pos: sc.player?.pos ? [...sc.player.pos] : [0, 0, 0],
      vy: 0,
      flames: sc.player?.flames ?? TUNING.flames,
      carried: sc.player?.carried ?? 0,
    },
    lanterns,
    shades,
    motes,
    nextMoteId: motes.length + 1,
    nextShadeId: shades.length + 1,
    prevInput: { ...DEFAULT_INPUT, move: [0, 0] },
  };
}

export function timeLeftS(w: World): number {
  return Math.max(0, w.startTimeLeftS - w.steps / WORLD.tick_rate);
}

export function round3(v: number): number {
  const x = Math.round(v * 1000) / 1000;
  return x === 0 ? 0 : x; // avoid -0
}
