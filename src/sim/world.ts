import { nightMap } from "./maps.js";
import { Rng } from "./rng.js";
import type { Scenario } from "./scenario.js";
import { TUNING, WORLD } from "./tuning.js";
import {
  DEFAULT_INPUT,
  type Charm,
  type Drifter,
  type Lantern,
  type Mote,
  type Shade,
  type ShadeState,
  type Vec3,
  type World,
} from "./types.js";

/** Build the initial world (snapshot tick 0). Scenario setup emits no events and awards no score. */
export function createWorld(seed: number, night = 1, sc: Scenario = {}): World {
  const map = nightMap(night);
  const rng = new Rng(seed);

  const lanterns: Lantern[] = map.lanterns.map((pos, i) => ({
    id: `L${i + 1}`,
    pos: [...pos],
    lit: false,
    deposited: 0,
    fuel: 0,
    everLit: false,
    relitCount: 0,
  }));
  for (const l of sc.lanterns ?? []) {
    const target = lanterns.find((x) => x.id === l.id)!;
    if (l.pos) target.pos = [...l.pos];
    if (l.lit !== undefined) target.lit = l.lit;
    if (l.deposited !== undefined) target.deposited = l.deposited;
    // Ticket-03 §7: a lantern set lit without fuel gets fuel 100; a lit lantern has been lit (P3-A6).
    if (target.lit) target.fuel = Math.round((l.fuel ?? TUNING.fuel_max) * WORLD.fuel_units_per_fuel);
    target.everLit = l.ever_lit ?? target.lit;
  }

  const start: Vec3 = sc.player?.pos ? [...sc.player.pos] : [...map.start];
  const w: World = {
    rng,
    map,
    randomShades: sc.random_shades !== false,
    randomMotes: sc.random_motes !== false,
    randomDrifters: sc.random_drifters !== false,
    windEnabled: sc.wind_enabled !== false,
    steps: 0,
    started: false,
    simTicks: 0,
    startTimeLeftS: sc.time_left_s ?? map.duration_s,
    state: "playing",
    score: 0,
    player: {
      pos: start,
      vel: [0, 0, 0],
      vy: 0,
      grounded: isGrounded(map.groundAt(start[0], start[2]), start[1]),
      facing: [0, 1],
      flames: sc.player?.flames ?? TUNING.flames,
      carried: sc.player?.carried ?? 0,
      invulnTicks: sc.player?.invuln_ticks ?? 0,
      dashCdTicks: sc.player?.dash_cd_ticks ?? 0,
      pulseCdTicks: sc.player?.pulse_cd_ticks ?? 0,
      charmTicks: sc.player?.charm_ticks ?? 0,
      dashLeft: 0,
      dashDir: [0, 1],
      launch: null,
      respawnTicks: 0,
      falling: false,
      successfulLights: sc.player?.successful_lights ?? 0,
    },
    lanterns,
    shades: [],
    motes: [],
    drifters: [],
    charms: [],
    wind: { active: false, dirDeg: 0, warning: false },
    nextMoteId: 1,
    nextShadeId: 1,
    nextDrifterId: 1,
    prevInput: { ...DEFAULT_INPUT, move: [0, 0] },
  };

  if (sc.motes) {
    // Scenario list replaces the generated list.
    for (const pos of sc.motes) w.motes.push({ id: `M${w.nextMoteId++}`, pos: [...pos], kind: "random", ttl: null, spawnIdx: null });
  } else if (w.randomMotes) {
    // R19: 20 motes on 20 distinct spawn points chosen by the seed.
    const idx = shuffle(rng, map.moteSpawns.map((_, i) => i)).slice(0, WORLD.mote_initial);
    for (const i of idx.sort((a, b) => a - b)) addRandomMote(w, i);
  }

  if (sc.shades) {
    // Scenario shades are active immediately (contract v1.0 §D) unless a state is given.
    for (const s of sc.shades) {
      const shade = makeShade(s.id ?? newShadeId(w, sc.shades), s.pos, s.pos[1] - (map.groundAt(s.pos[0], s.pos[2]) ?? 0));
      shade.targetLanternId = s.target_lantern_id ?? null;
      if (s.state) setShadeState(shade, s.state, s.state_ticks_left);
      else shade.state = activeState(w, shade);
      w.shades.push(shade);
    }
  }

  if (sc.drifters) {
    for (const d of sc.drifters) {
      const id = d.id ?? newDrifterId(w, sc.drifters);
      const state = d.state ?? "idle";
      const stolen = d.stolen ?? 0;
      w.drifters.push({
        id,
        pos: [...d.pos],
        state,
        stolen,
        hasStolen: stolen > 0,
        ticks: d.state_ticks_left ?? (state === "flee" ? WORLD.drifter_flee_ticks : 0),
        wanderTarget: null,
        wanderTicks: 0,
      });
    }
  }

  const charmList = sc.charms ?? map.charms.map((pos) => ({ pos }) as NonNullable<Scenario["charms"]>[number]);
  w.charms = charmList.map((c, i): Charm => ({
    id: c.id ?? `C${i + 1}`,
    pos: [...c.pos],
    available: c.available ?? !(c.respawn_ticks && c.respawn_ticks > 0),
    respawnTicks: c.respawn_ticks ?? 0,
  }));
  return w;
}

export function isGrounded(ground: number | null, y: number): boolean {
  return ground !== null && Math.abs(y - ground) < 1e-6;
}

export function addRandomMote(w: World, spawnIdx: number): Mote {
  const m: Mote = { id: `M${w.nextMoteId++}`, pos: [...w.map.moteSpawns[spawnIdx]!], kind: "random", ttl: null, spawnIdx };
  w.motes.push(m);
  return m;
}

export function addDroppedMote(w: World, x: number, z: number): Mote | null {
  const g = w.map.groundAt(x, z);
  if (g === null) return null; // A16: fell into the cloud sea
  const m: Mote = { id: `M${w.nextMoteId++}`, pos: [x, g, z], kind: "dropped", ttl: WORLD.dropped_ttl_ticks, spawnIdx: null };
  w.motes.push(m);
  return m;
}

export function makeShade(id: string, pos: Vec3, hover: number): Shade {
  return {
    id,
    pos: [...pos],
    state: "chase",
    ticks: 0,
    hover,
    pushLeft: 0,
    pushStep: [0, 0],
    wanderTarget: null,
    wanderTicks: 0,
    targetLanternId: null,
    drainTicks: 0,
  };
}

/** Ticket-03 §4: carrying capacity = 10 + 2 × successful lights, at most 20. */
export function capacity(w: World): number {
  return Math.min(TUNING.capacity_max, TUNING.carry_capacity + WORLD.capacity_per_light * w.player.successfulLights);
}

/** Ticket-03 §2: a lit lantern with fuel ≥ 30 keeps its safe zone; below 30 it loses it. */
export function hasSafeZone(l: Lantern): boolean {
  return l.lit && l.fuel >= WORLD.low_fuel_units;
}

/** Fuel as output: real number, 1 decimal; 0 when unlit (Ticket-03 §7). */
export function fuelOut(l: Lantern): number {
  return l.lit ? Math.round(l.fuel / (WORLD.fuel_units_per_fuel / 10)) / 10 : 0;
}

export function setShadeState(s: Shade, state: ShadeState, ticksLeft?: number): void {
  s.state = state;
  const def = state === "spawning" ? WORLD.shade_spawning_ticks : state === "stunned" ? WORLD.stun_ticks : state === "recoil" ? WORLD.recoil_ticks : 0;
  s.ticks = ticksLeft ?? def;
  if (state === "recoil") {
    s.pushLeft = s.ticks;
    s.pushStep = [0, 0];
  }
}

/** A13: what an idle (not timed) shade does: chase within shade_detect, otherwise wander. */
export function activeState(w: World, s: Shade): ShadeState {
  return distXZ(s.pos, w.player.pos) <= WORLD.shade_detect ? "chase" : "wander";
}

export function newShadeId(w: World, reserved: { id?: string }[] = []): string {
  const taken = new Set([...w.shades.map((s) => s.id), ...reserved.map((s) => s.id)]);
  while (taken.has(`S${w.nextShadeId}`)) w.nextShadeId++;
  return `S${w.nextShadeId++}`;
}

export function newDrifterId(w: World, reserved: { id?: string }[] = []): string {
  const taken = new Set([...w.drifters.map((d) => d.id), ...reserved.map((d) => d.id)]);
  while (taken.has(`D${w.nextDrifterId}`)) w.nextDrifterId++;
  return `D${w.nextDrifterId++}`;
}

export function newDrifter(w: World, pos: Vec3): Drifter {
  const d: Drifter = { id: newDrifterId(w), pos: [...pos], state: "idle", stolen: 0, hasStolen: false, ticks: 0, wanderTarget: null, wanderTicks: 0 };
  w.drifters.push(d);
  return d;
}

export function timeLeftS(w: World): number {
  return Math.max(0, w.startTimeLeftS - w.simTicks / WORLD.tick_rate);
}

/** XZ-plane distance (contract §B). */
export function distXZ(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
}

export function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function round3(v: number): number {
  const x = Math.round(v * 1000) / 1000;
  return x === 0 ? 0 : x; // avoid -0
}
