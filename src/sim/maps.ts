// Standard maps of Ticket-02 "Phần 2 — Bản đồ chuẩn". Angles: from +X, counter-clockwise seen from above,
// i.e. x = r·cos θ, z = r·sin θ (A3). Terrain is a heightfield: groundAt(x, z) is the walkable top surface,
// or null over the cloud sea (A4).
import { TUNING } from "./tuning.js";
import type { Vec3 } from "./types.js";

export type NightId = 1 | 2 | 3;

export interface BouncePad {
  pos: Vec3;
  radius: number;
  vy: number;
  /** Horizontal launch velocity [vx, vz]. */
  vh: [number, number];
}

export interface NightMap {
  night: NightId;
  name: string;
  duration_s: number;
  start: Vec3;
  lanterns: Vec3[];
  moteSpawns: Vec3[];
  shadeSpawns: Vec3[];
  shadeInterval: number; // ticks between spawns after the first wave
  shadeMax: number;
  shadeSpeed: number;
  pads: BouncePad[];
  charms: Vec3[];
  drifters: boolean;
  wind: boolean;
  /** Bounding radius around (cx, 0) used by the renderer for the cloud sea / camera. */
  bounds: { cx: number; cz: number; r: number };
  groundAt(x: number, z: number): number | null;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
export const polar = (r: number, deg: number, y = 0, cx = 0, cz = 0): Vec3 => [
  r3(cx + r * Math.cos(rad(deg))),
  y,
  r3(cz + r * Math.sin(rad(deg))),
];
const ring = (n: number, r: number, startDeg: number, stepDeg: number, y = 0, cx = 0, cz = 0): Vec3[] =>
  Array.from({ length: n }, (_, i) => polar(r, startDeg + i * stepDeg, y, cx, cz));

// ---------- Night 1 — Đảo Bến ----------
const night1: NightMap = {
  night: 1,
  name: "Đảo Bến",
  duration_s: TUNING.night1_duration_s,
  start: [0, 0, 0],
  lanterns: [
    [0, 0, 25],
    [23.8, 0, 7.7],
    [14.7, 0, -20.2],
    [-14.7, 0, -20.2],
    [-23.8, 0, 7.7],
  ],
  moteSpawns: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
  shadeSpawns: ring(12, 37, 15, 30),
  shadeInterval: 480,
  shadeMax: 6,
  shadeSpeed: TUNING.shade_speed,
  pads: [],
  charms: [],
  drifters: false,
  wind: false,
  bounds: { cx: 0, cz: 0, r: 40 },
  groundAt: (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null),
};

// ---------- Night 2 — Đảo Cau ----------
const N2_B = 70;
const toward = (from: Vec3, to: [number, number], speed: number): [number, number] => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[2];
  const d = Math.hypot(dx, dz);
  return [(dx / d) * speed, (dz / d) * speed];
};
const night2: NightMap = {
  night: 2,
  name: "Đảo Cau",
  duration_s: TUNING.night2_duration_s,
  start: [0, 0, 0],
  lanterns: [
    [0, 0, 20],
    [17, 0, -10],
    [-17, 0, -10],
    [70, 0, 20],
    [87, 0, -10],
    [53, 0, -10],
  ],
  moteSpawns: [
    ...ring(4, 10, 0, 90),
    ...ring(8, 22, 0, 45),
    ...ring(4, 10, 0, 90, 0, N2_B),
    ...ring(8, 22, 0, 45, 0, N2_B),
  ],
  shadeSpawns: [...ring(8, 26, 22.5, 45), ...ring(8, 26, 22.5, 45, 0, N2_B)],
  shadeInterval: 420,
  shadeMax: 8,
  shadeSpeed: TUNING.shade_speed,
  pads: [
    { pos: [20, 0, 18], radius: 1, vy: 14, vh: toward([20, 0, 18], [N2_B, 0], 24) },
    { pos: [50, 0, -18], radius: 1, vy: 14, vh: toward([50, 0, -18], [0, 0], 24) },
  ],
  charms: [[35, 0, 0]],
  drifters: true,
  wind: false,
  bounds: { cx: 35, cz: 0, r: 65 },
  groundAt: (x, z) => {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - N2_B, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge, no railing
    return null;
  },
};

// ---------- Night 3 — Đảo Chuông ----------
const RAMP_DEGS = [30, 150];
const RAMP_HALF_W = 1.5;
/** Ramp height along a radial strip: r = 30 (Y = 0) up to r = 24 (Y = 3); null if not on a ramp. */
function rampHeight(x: number, z: number): number | null {
  for (const deg of RAMP_DEGS) {
    const ux = Math.cos(rad(deg));
    const uz = Math.sin(rad(deg));
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (perp <= RAMP_HALF_W && along >= 24 && along <= 30) return ((30 - along) / 6) * 3;
  }
  return null;
}
const night3: NightMap = {
  night: 3,
  name: "Đảo Chuông",
  duration_s: TUNING.night3_duration_s,
  start: [0, 0, -30], // A2: centre is tier 2 + bell tower
  lanterns: [
    [0, 6, 6],
    [18, 3, 10],
    [-18, 3, 10],
    [35, 0, -10],
    [-35, 0, -10],
    [20, 0, -35],
    [-20, 0, -35],
  ],
  moteSpawns: [...ring(18, 34, 0, 20, 0), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
  shadeSpawns: ring(16, 43, 0, 22.5),
  shadeInterval: 360,
  shadeMax: 10,
  shadeSpeed: 4.5,
  pads: [{ pos: [0, 3, 13], radius: 1, vy: 12, vh: [0, -8] }],
  charms: [
    [30, 0, 25],
    [-30, 0, 25],
  ],
  drifters: true,
  wind: true,
  bounds: { cx: 0, cz: 0, r: 45 },
  groundAt: (x, z) => {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    if (r <= 2) return 14; // bell tower: 8 m on top of tier 2, unclimbable
    if (r <= 8) return 6; // tier 2
    if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1 (half annulus)
    const ramp = rampHeight(x, z);
    if (ramp !== null) return ramp;
    return 0;
  },
};

export const MAPS: Record<NightId, NightMap> = { 1: night1, 2: night2, 3: night3 };

export function nightMap(n: number): NightMap {
  const m = MAPS[n as NightId];
  if (!m) throw new Error(`unknown night ${n}`);
  return m;
}
