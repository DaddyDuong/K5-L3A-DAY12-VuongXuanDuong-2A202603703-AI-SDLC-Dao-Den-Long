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

  const w: World = {
    rng,
    randomShades: sc.random_shades !== false,
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
    shades: [],
    motes,
    nextMoteId: motes.length + 1,
    nextShadeId: 1,
    invulnUntil: 0,
    pulseReadyAt: 0,
    prevInput: { ...DEFAULT_INPUT, move: [0, 0] },
  };

  if (sc.shades) {
    // Scenario list replaces the initial shades; generated ids must not collide with these.
    for (const s of sc.shades) w.shades.push(makeShade(s.id ?? newShadeId(w, sc.shades), s.pos));
  } else if (w.randomShades) {
    for (let i = 0; i < WORLD.shade_initial_count; i++) {
      spawnShadeOnRim(w, Math.PI + (2 * Math.PI * i) / WORLD.shade_initial_count);
    }
  }
  return w;
}

function makeShade(id: string, pos: Vec3): Shade {
  return { id, pos: [...pos], state: "chase", stunUntil: 0 };
}

function newShadeId(w: World, reserved: { id?: string }[] = []): string {
  const taken = new Set([...w.shades.map((s) => s.id), ...reserved.map((s) => s.id)]);
  while (taken.has(`S${w.nextShadeId}`)) w.nextShadeId++;
  return `S${w.nextShadeId++}`;
}

/** R4: spawn on the island rim at (player bearing + offset) ± jitter. Returns the new shade. */
export function spawnShadeOnRim(w: World, offsetRad: number): Shade {
  const bearing = Math.atan2(w.player.pos[0], w.player.pos[2]);
  const jitter = (w.rng.range(-WORLD.shade_spawn_jitter_deg, WORLD.shade_spawn_jitter_deg) * Math.PI) / 180;
  const a = bearing + offsetRad + jitter;
  const r = WORLD.shade_spawn_radius;
  const shade = makeShade(newShadeId(w), [round3(r * Math.sin(a)), WORLD.shade_y, round3(r * Math.cos(a))]);
  w.shades.push(shade);
  return shade;
}

export function timeLeftS(w: World): number {
  return Math.max(0, w.startTimeLeftS - w.steps / WORLD.tick_rate);
}

export function round3(v: number): number {
  const x = Math.round(v * 1000) / 1000;
  return x === 0 ? 0 : x; // avoid -0
}
