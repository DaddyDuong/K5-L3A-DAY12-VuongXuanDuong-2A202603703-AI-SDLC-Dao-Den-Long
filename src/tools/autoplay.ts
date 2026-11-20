// Bot that plays a night through the real sim and records contract-format inputs.
// Ticket-03: the goal is to survive until dawn with ≥ ceil(0.6 × lanterns) lit, so the bot banks motes into unlit
// lanterns during the night and lights them in the final minute (see chooseLantern).
// Used to prove each night is winnable and to produce replays for visual evidence.
// Navigation: Dijkstra on a 1 m grid over the night's heightfield (walls block, drops allowed,
// bounce pads are one-way flight edges), re-planned every few ticks.
import type { InputFrame } from "../sim/inputs.js";
import type { NightMap } from "../sim/maps.js";
import type { Scenario } from "../sim/scenario.js";
import { litNeeded, step } from "../sim/step.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import { DEFAULT_INPUT, type GameState, type InputState, type Vec3, type World } from "../sim/types.js";
import { capacity, createWorld, distXZ, timeLeftS } from "../sim/world.js";

export interface AutoplayResult {
  frames: InputFrame[];
  state: GameState;
  score: number;
  ticks: number;
  flames: number;
}

const MAX_TURN_DEG = 8; // camera yaw change per tick, keeps the replay camera smooth
const REPLAN_TICKS = 12;

// ---------- navigation grid ----------
interface Grid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  h: Float64Array; // ground at cell centre (NaN = not walkable)
  padEdge: Map<number, number>; // pad cell -> landing cell
  padZone: Uint8Array; // cells around pads: never walked through (would launch us by accident)
  approach: Map<number, number>; // cell just outside a pad zone -> pad cell (walk straight onto the pad)
}

function buildGrid(map: NightMap): Grid {
  const { cx, cz, r } = map.bounds;
  const x0 = Math.floor(cx - r - 2);
  const z0 = Math.floor(cz - r - 2);
  const nx = Math.ceil(2 * r + 4);
  const nz = Math.ceil(2 * r + 4);
  const h = new Float64Array(nx * nz).fill(NaN);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = x0 + i + 0.5;
      const z = z0 + j + 0.5;
      const c = map.groundAt(x, z);
      if (c === null) continue;
      // Keep a margin from the cloud sea: every corner must have ground.
      const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([a, b]) => map.groundAt(x + a!, z + b!));
      if (corners.some((g) => g === null)) continue;
      h[i + j * nx] = c;
    }
  }
  const g: Grid = { x0, z0, nx, nz, h, padEdge: new Map(), padZone: new Uint8Array(nx * nz), approach: new Map() };
  for (const pad of map.pads) {
    const pc = cellOf(g, pad.pos);
    h[pc] = pad.pos[1]; // pads can sit near the island edge: the pad cell is always usable
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const c = i + j * nx;
        if (distXZ(center(g, c), pad.pos) <= pad.radius + 0.9 && c !== pc) g.padZone[c] = 1;
      }
    g.padEdge.set(pc, cellOf(g, landing(map, pad.pos, pad.vy, pad.vh)));
    for (let c = 0; c < nx * nz; c++) {
      const d = distXZ(center(g, c), pad.pos);
      if (!g.padZone[c] && c !== pc && d <= pad.radius + 1.7 && Math.abs(h[c]! - pad.pos[1]) < 0.3) g.approach.set(c, pc);
    }
  }
  return g;
}

/** Where a pad launch lands (same integrator as the sim, ignoring walls). */
function landing(map: NightMap, from: Vec3, vy0: number, vh: [number, number]): Vec3 {
  const p: Vec3 = [...from];
  let vy = vy0;
  for (let t = 0; t < 600; t++) {
    vy -= WORLD.gravity / WORLD.tick_rate;
    p[0] += vh[0] / WORLD.tick_rate;
    p[2] += vh[1] / WORLD.tick_rate;
    p[1] += vy / WORLD.tick_rate;
    const g = map.groundAt(p[0], p[2]);
    if (vy < 0 && g !== null && p[1] <= g) break;
  }
  return p;
}

const cellOf = (g: Grid, p: readonly number[]) =>
  Math.floor(p[0]! - g.x0) + Math.floor(p[2]! - g.z0) * g.nx;
const center = (g: Grid, c: number): Vec3 => [g.x0 + (c % g.nx) + 0.5, g.h[c]!, g.z0 + Math.floor(c / g.nx) + 0.5];

/** Dijkstra from `start`; returns distance and parent arrays. */
function flood(g: Grid, start: number, extra: Float64Array): { dist: Float64Array; parent: Int32Array } {
  const n = g.nx * g.nz;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  if (start < 0 || start >= n) return { dist, parent };
  dist[start] = 0;
  const heap: [number, number][] = [[0, start]];
  const push = (d: number, c: number) => {
    heap.push([d, c]);
    let i = heap.length - 1;
    while (i > 0) {
      const pi = (i - 1) >> 1;
      if (heap[pi]![0] <= heap[i]![0]) break;
      [heap[pi], heap[i]] = [heap[i]!, heap[pi]!];
      i = pi;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]] as const;
  while (heap.length > 0) {
    const [d, c] = pop();
    if (d > dist[c]!) continue;
    const pad = g.padEdge.get(c);
    if (pad !== undefined) {
      // Standing on a pad always launches: the only way out is the flight.
      if (d + 5 < dist[pad]!) {
        dist[pad] = d + 5;
        parent[pad] = c;
        push(d + 5, pad);
      }
      continue;
    }
    const toPad = g.approach.get(c);
    if (toPad !== undefined && d + 2 < dist[toPad]!) {
      dist[toPad] = d + 2;
      parent[toPad] = c;
      push(d + 2, toPad);
    }
    const ci = c % g.nx;
    const cj = Math.floor(c / g.nx);
    for (const [di, dj, cost] of DIRS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const nb = i + j * g.nx;
      if (!walk(g, c, nb)) continue;
      if (di !== 0 && dj !== 0 && (!walk(g, c, ci + di + cj * g.nx) || !walk(g, c, ci + (cj + dj) * g.nx))) continue;
      const nd = d + cost + extra[nb]!;
      if (nd < dist[nb]!) {
        dist[nb] = nd;
        parent[nb] = c;
        push(nd, nb);
      }
    }
  }
  return { dist, parent };
}

function walk(g: Grid, from: number, to: number): boolean {
  const ht = g.h[to]!;
  if (Number.isNaN(ht)) return false;
  // Never walk into the ring around a pad (it would launch us by accident), but a bot already inside it (pushed there
  // while dodging) may walk out: otherwise every neighbour is blocked and it stands still until hit three times.
  if (g.padZone[to] && !g.padZone[from]) return false;
  return ht <= g.h[from]! + WORLD.step_up; // walls block, drops are fine
}

// ---------- bot ----------
/** Strategy knobs (defaults from a seed scan of each night, see docs/notes/phase-3-assumptions.md §6). */
export interface BotOptions {
  /** Pulse when at least this many active shades are in range (each pulse burns 3 scarce motes). */
  pack: number;
  /** Final phase: seconds before dawn when the bot lights the banked lanterns (lit then = still ≥ 30 fuel at dawn). */
  final: number;
  /** Lanterns to have safely lit at dawn, beyond the ceil(0.6 n) needed. */
  margin: number;
  /** Walk to a lantern to bank once carrying this many motes (drifters steal from a bag of ≥ 5). */
  bank: number;
  /** Ticks without picking up or depositing after which a shade in range is pulsed (it is blocking the way). */
  stuck: number;
  /** Radius of the path-cost ring around chasing shades (we outrun them; a 5 m ring made the bot orbit one). */
  chaseR: number;
  /** Pulse shades guarding the goal lantern once within this many metres of it (0 = never). */
  assault: number;
}
export const BOT_DEFAULTS: BotOptions = { pack: 99, final: 69, margin: 1, bank: 4, stuck: 1200, chaseR: 3, assault: 0 };

export function autoplay(seed: number, night = 1, scenario: Scenario = {}, maxTicks = 21600, opts: BotOptions = BOT_DEFAULTS): AutoplayResult {
  const w = createWorld(seed, night, scenario);
  const grid = buildGrid(w.map);
  const frames: InputFrame[] = [];
  let yaw = w.map.night === 3 ? 90 : 0;
  let prev: InputState = { ...DEFAULT_INPUT, move: [0, 0] };
  let path: Vec3[] = [];
  let goal: "lantern" | "mote" | null = null;
  let goalLantern = "";
  let replanAt = 0;
  let lastProgress = { pos: [...w.player.pos] as Vec3, tick: 0 };
  let lastGain = { carried: w.player.carried, tick: 0 }; // last pickup or deposit

  for (let k = 0; k < maxTicks && w.state === "playing"; k++) {
    const p = w.player;
    const airborne = !p.grounded || p.falling;
    if (!airborne && (k >= replanAt || path.length === 0)) {
      ({ path, goal, goalLantern } = plan(w, grid, opts));
      replanAt = k + REPLAN_TICKS;
    }
    // Unstick: no progress for 1.5 s -> replan now.
    if (distXZ(p.pos, lastProgress.pos) > 1) lastProgress = { pos: [...p.pos], tick: k };
    else if (k - lastProgress.tick > 90) {
      replanAt = k;
      lastProgress = { pos: [...p.pos], tick: k };
    }
    while (path.length > 1 && distXZ(p.pos, path[0]!) < 0.35) path.shift();
    const target = path[0];

    const lantern = w.lanterns.find((l) => l.id === goalLantern);
    const atLantern =
      goal === "lantern" && lantern !== undefined && distXZ(p.pos, lantern.pos) <= TUNING.interact_radius - 0.3 && !airborne;
    const threat = p.invulnTicks > 20 ? null : closestThreat(w);
    const close = threat !== null && threat.d <= 2.6;
    const pulseReady = p.pulseCdTicks === 0 && p.carried >= TUNING.pulse_cost && !airborne;
    const dashReady = p.dashCdTicks === 0 && p.dashLeft === 0 && !airborne;
    let dash = false;
    let pulse = false;
    let flee: [number, number] | null = null;
    // Pulses burn 3 of the scarce motes, so the bot does not pulse every pack (that cost Ticket-03 nights).
    // But a shade chasing us back and forth between us and the goal can stall the bot for minutes:
    // when nothing was picked up or deposited for `stuck` ticks, stun what is in range and go through.
    if (p.carried !== lastGain.carried) lastGain = { carried: p.carried, tick: k };
    const stalled = k - lastGain.tick > opts.stuck;
    if (pulseReady && packInRange(w) >= (stalled ? 1 : opts.pack)) {
      pulse = true;
      if (stalled) lastGain.tick = k;
    }
    // Wander shades gather at unlit lanterns (Ticket-03 §2): stun the guards when we reach the goal lantern,
    // keeping at least one mote to put in.
    if (pulseReady && lantern && goal === "lantern" && p.carried > TUNING.pulse_cost && distXZ(p.pos, lantern.pos) <= opts.assault && packInRange(w) >= 1) pulse = true;
    if (close && threat && !airborne) {
      if (dashReady && safeDash(w, threat.dir)) dash = true;
      // Motes are the scarce resource (pulse burns 3, a hit only drops half and they can be picked up again):
      // pulse only to save the last flame.
      else if (pulseReady && threat.d <= 2 && p.flames === 1) pulse = true;
      flee = threat.dir;
    }
    // Drifters are never pulsed: a steal takes min(3, carried), never more than the 3 motes a pulse burns.

    let dx = target ? target[0] - p.pos[0] : 0;
    let dz = target ? target[2] - p.pos[2] : 0;
    if (flee) {
      // Run away from the shade, but only to ground at our level.
      const ok = safeDash(w, flee);
      dx = ok ? flee[0] : dx;
      dz = ok ? flee[1] : dz;
      if (ok) replanAt = k + 1;
    }
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const want = (Math.atan2(dx, dz) * 180) / Math.PI;
      const diff = ((want - yaw + 540) % 360) - 180;
      yaw += Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, diff));
      yaw = ((yaw % 360) + 360) % 360;
    }
    const th = (yaw * Math.PI) / 180;
    const [wx, wz] = d > 0.05 && (!atLantern || flee) ? [dx / d, dz / d] : [0, 0];
    const move: [number, number] = [
      round6(wx * Math.cos(th) - wz * Math.sin(th)),
      round6(wx * Math.sin(th) + wz * Math.cos(th)),
    ];

    const input: InputState = {
      ...DEFAULT_INPUT,
      move,
      cam_yaw_deg: round6(yaw),
      interact: atLantern && !prev.interact,
      pulse: pulse && !prev.pulse,
      dash: dash && !prev.dash,
    };
    const frame = diffFrame(k, prev, input);
    if (frame) frames.push(frame);
    prev = input;
    const before = w.lanterns.filter((l) => l.lit).length;
    step(w, input);
    if (w.lanterns.filter((l) => l.lit).length !== before || input.interact) replanAt = k + 1;
  }
  return { frames, state: w.state, score: w.score, ticks: w.steps, flames: w.player.flames };
}

/** Choose a goal (lantern if we carry enough, else the nearest reachable mote) and a path to it. */
function plan(w: World, g: Grid, opts: BotOptions): { path: Vec3[]; goal: "lantern" | "mote" | null; goalLantern: string } {
  const p = w.player;
  // We may stand in a margin cell (e.g. after dodging), or beside a ramp whose surface covers the cell centre:
  // let the search leave the cell from our real height.
  const start = cellOf(g, p.pos);
  const saved = g.h[start];
  if (saved !== undefined && !(Math.abs(saved - p.pos[1]) <= 1)) g.h[start] = p.pos[1];
  const { dist, parent } = flood(g, start, danger(w, g, opts.chaseR));
  if (saved !== undefined) g.h[start] = saved;
  const reach = (pos: Vec3) => dist[cellOf(g, pos)] ?? Infinity;
  const motes = w.motes
    .filter((m) => Math.abs(m.pos[1] - (g.h[cellOf(g, m.pos)] ?? NaN)) < 0.6 && reach(m.pos) < Infinity)
    .sort((a, b) => reach(a.pos) - reach(b.pos));
  const lantern = chooseLantern(w, reach, motes.length === 0, opts);
  const goLantern = lantern !== undefined;
  const goalPos = goLantern ? lantern!.pos : motes[0]?.pos;
  if (!goalPos) return { path: [], goal: null, goalLantern: "" };
  const cells: number[] = [];
  for (let c = cellOf(g, goalPos); c !== -1; c = parent[c]!) cells.unshift(c);
  const path = cells.slice(1).map((c) => center(g, c));
  path.push([...goalPos]);
  return { path, goal: goLantern ? "lantern" : "mote", goalLantern: goLantern ? lantern!.id : "" };
}

/**
 * Which lantern to walk to now, if any (Ticket-03: win = enough lanterns lit at dawn, a lantern burns 1 fuel/s).
 * Cheapest way to have a lantern lit at dawn: bank (cost − 1) motes into a never-lit lantern (an unlit lantern keeps its
 * deposit), then light it with one mote in the final `final` seconds, so it still has ≥ 30 fuel at dawn (never loses
 * its safe zone, never drained). 10 motes per lantern; lighting early and relighting later costs 10 + 5.
 * - before the final phase: bank into the nearest unlit lantern with room, once carrying `bank` motes (or full);
 * - final phase: make `litNeeded + margin` lanterns "safe" (fuel ≥ time left + 31) by the cheapest nearby action.
 */
function chooseLantern(w: World, reach: (p: Vec3) => number, noMotes: boolean, opts: BotOptions) {
  const p = w.player;
  if (p.carried <= 0) return undefined;
  type L = World["lanterns"][number];
  const T = timeLeftS(w);
  const fuel = (l: L) => l.fuel / WORLD.fuel_units_per_fuel;
  const ok = (l: L) => reach(l.pos) < Infinity;
  const byReach = (a: L, b: L) => reach(a.pos) - reach(b.pos);
  const full = p.carried >= capacity(w) || noMotes;
  const costOf = (l: L) => (l.everLit ? TUNING.relight_cost : TUNING.lantern_cost);
  const want = Math.min(w.lanterns.length, litNeeded(w.lanterns.length) + opts.margin);
  if (T > opts.final) {
    // Interact puts min(carried, cost − deposited) in: a bag bigger than the room would light the lantern now.
    const room = (l: L) => costOf(l) - 1 - l.deposited;
    const bank = w.lanterns.filter((l) => !l.lit && ok(l) && room(l) >= p.carried).sort(byReach)[0];
    if (bank && (p.carried >= Math.min(room(bank), opts.bank) || full)) return bank;
    return undefined;
  }
  const keep = Math.min(TUNING.fuel_max, T + 31);
  const safe = w.lanterns.filter((l) => l.lit && fuel(l) >= keep).length;
  if (safe >= want) return undefined;
  const cost = (l: L) => (l.lit ? Math.ceil((keep - fuel(l) + 1) / TUNING.fuel_per_mote) : costOf(l) - l.deposited);
  const todo = w.lanterns.filter((l) => ok(l) && !(l.lit && fuel(l) >= keep)).sort(byReach);
  return todo.find((l) => p.carried >= cost(l)) ?? (full ? todo[0] : undefined);
}

/** Extra path cost near shades that can hurt (stunned / spawning ones and other levels are ignored). */
function danger(w: World, g: Grid, chaseR: number): Float64Array {
  const extra = new Float64Array(g.nx * g.nz);
  const R = 5;
  for (const s of w.shades) {
    if (s.state === "stunned" || s.state === "spawning" || s.state === "drain") continue;
    const ci = Math.floor(s.pos[0] - g.x0);
    const cj = Math.floor(s.pos[2] - g.z0);
    for (let i = ci - R; i <= ci + R; i++)
      for (let j = cj - R; j <= cj + R; j++) {
        if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
        const c = i + j * g.nx;
        // A shade on another level (night 3 tiers) cannot reach this cell: no extra cost.
        if (!(Math.abs(g.h[c]! - (s.pos[1] - s.hover)) <= 1.5)) continue;
        const d = distXZ(center(g, c), s.pos);
        const r = s.state === "chase" ? chaseR : R;
        if (d < 2) extra[c] = extra[c]! + 200;
        else if (d < r) extra[c] = extra[c]! + (r - d) * 8;
      }
  }
  return extra;
}

/** Closest shade that can hurt us soon (same level, active). */
function closestThreat(w: World): { d: number; dir: [number, number] } | null {
  const p = w.player;
  let best: { d: number; dir: [number, number] } | null = null;
  for (const s of w.shades) {
    if (s.state !== "chase" && s.state !== "wander") continue;
    if (Math.abs(s.pos[1] - s.hover - p.pos[1]) > 1.5) continue;
    const d = distXZ(p.pos, s.pos);
    if (!best || d < best.d) best = { d, dir: d > 0 ? [(p.pos[0] - s.pos[0]) / d, (p.pos[2] - s.pos[2]) / d] : [1, 0] };
  }
  return best;
}

/** Active shades within pulse range (3D from feet + 0.8 m, with a small margin). */
function packInRange(w: World): number {
  const p = w.player;
  const c = [p.pos[0], p.pos[1] + WORLD.pulse_center_h, p.pos[2]];
  return w.shades.filter(
    (s) => (s.state === "chase" || s.state === "wander") && Math.hypot(s.pos[0] - c[0]!, s.pos[1] - c[1]!, s.pos[2] - c[2]!) <= TUNING.pulse_radius - 0.3,
  ).length;
}

/** A straight dash of 2.8 m along `dir` stays on ground at about our level. */
function safeDash(w: World, dir: [number, number]): boolean {
  const p = w.player;
  for (let t = 0.5; t <= 3.5; t += 0.5) {
    const g = w.map.groundAt(p.pos[0] + dir[0] * t, p.pos[2] + dir[1] * t);
    if (g === null || Math.abs(g - p.pos[1]) > 0.4) return false;
  }
  return true;
}

function diffFrame(tick: number, a: InputState, b: InputState): InputFrame | null {
  const f: InputFrame = { tick };
  if (a.move[0] !== b.move[0] || a.move[1] !== b.move[1]) f.move = b.move;
  if (a.cam_yaw_deg !== b.cam_yaw_deg) f.cam_yaw_deg = b.cam_yaw_deg;
  if (a.interact !== b.interact) f.interact = b.interact;
  if (a.pulse !== b.pulse) f.pulse = b.pulse;
  if (a.dash !== b.dash) f.dash = b.dash;
  return Object.keys(f).length > 1 ? f : null;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
