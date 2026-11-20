// Ticket-04 §1 benchmark scene and §2 soak input. Pure sim code, shared by the web bench page and the tests.
import { Rng } from "./rng.js";
import type { InputState, Mote, World } from "./types.js";
import { DEFAULT_INPUT } from "./types.js";
import { createWorld, makeShade } from "./world.js";

export const BENCH = {
  shades: 200,
  motes: 100,
  litLanterns: ["L1", "L2", "L3"],
  /** P4-A6: spread uniformly by area over a disc of 38 m (2 m inside the 40 m edge of night 1). */
  spreadRadius: 38,
  warmupMs: 3000,
  camera: { radius: 30, height: 15, periodS: 15 },
} as const;

/**
 * Night 1 with exactly 200 wandering shades and 100 motes spread by `seed`, L1–L3 lit with fuel 100, Mây at (0,0,0),
 * and the bench flag on (no fuel burn, pickup, damage, spawning or end of night; shades stay in `wander`).
 */
export function createBenchWorld(seed: number): World {
  const w = createWorld(seed, 1, {
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    player: { pos: [0, 0, 0] },
    lanterns: BENCH.litLanterns.map((id) => ({ id, lit: true, fuel: 100 })),
  });
  w.bench = true;
  const rng = new Rng(seed);
  const spot = (): [number, number] => {
    const r = BENCH.spreadRadius * Math.sqrt(rng.next());
    const a = 2 * Math.PI * rng.next();
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  for (let i = 0; i < BENCH.shades; i++) {
    const [x, z] = spot();
    const s = makeShade(`S${i + 1}`, [x, 1, z], 1);
    s.state = "wander";
    w.shades.push(s);
  }
  w.nextShadeId = BENCH.shades + 1;
  for (let i = 0; i < BENCH.motes; i++) {
    const [x, z] = spot();
    const m: Mote = { id: `M${w.nextMoteId++}`, pos: [x, 0, z], kind: "random", ttl: null, spawnIdx: null };
    w.motes.push(m);
  }
  return w;
}

/** P4-A9: camera on a 30 m circle at Y 15 around (0,0,0), angle 0 at (30, 15, 0), one turn per 15 s. */
export function benchCamera(tSeconds: number): [number, number, number] {
  const th = (2 * Math.PI * tSeconds) / BENCH.camera.periodS;
  return [BENCH.camera.radius * Math.cos(th), BENCH.camera.height, BENCH.camera.radius * Math.sin(th)];
}

export interface FrameStats {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
}

/** Ticket-04 §1 definitions over the measured frame times `dt` (ms). */
export function frameStats(dt: readonly number[]): FrameStats {
  const n = dt.length;
  if (n === 0) return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  const sum = dt.reduce((a, b) => a + b, 0);
  const sorted = [...dt].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  const worst = sorted.slice(n - k);
  const worstAvg = worst.reduce((a, b) => a + b, 0) / k;
  // Nearest-rank 95th percentile: the smallest dt with at least 95% of the frames at or below it.
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)]!;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { frames: n, avg_fps: r1((1000 * n) / sum), p1_low_fps: r1(1000 / worstAvg), frame_ms_p95: Math.round(p95 * 100) / 100 };
}

/**
 * Ticket-04 §2 soak input, seeded: a new move direction every 30 ticks; each tick jump 5%, dash 3%, pulse 2%,
 * interact 10% (independent draws). Buttons are edge-triggered in the sim, so two pressed ticks in a row count once.
 */
export class SoakInput {
  private readonly rng: Rng;
  private move: [number, number] = [0, 0];
  constructor(seed: number) {
    this.rng = new Rng((seed ^ 0x5eed5eed) >>> 0);
  }
  at(tick: number): InputState {
    if (tick % 30 === 0) {
      const a = 2 * Math.PI * this.rng.next();
      this.move = [Math.sin(a), Math.cos(a)];
    }
    const roll = (p: number) => this.rng.next() < p;
    return {
      ...DEFAULT_INPUT,
      move: [...this.move],
      jump: roll(0.05),
      dash: roll(0.03),
      pulse: roll(0.02),
      interact: roll(0.1),
    };
  }
}
