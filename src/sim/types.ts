import type { NightMap } from "./maps.js";
import type { Rng } from "./rng.js";

export type Vec3 = [number, number, number];
export type GameState = "playing" | "paused" | "won" | "lost";

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export const BUTTONS = ["jump", "interact", "pulse", "dash", "pause"] as const;
export type Button = (typeof BUTTONS)[number];

export const DEFAULT_INPUT: InputState = {
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
  dash: false,
  pause: false,
};

export interface Player {
  pos: Vec3;
  /** Velocity actually travelled in the last tick (m/s). */
  vel: Vec3;
  vy: number;
  grounded: boolean;
  /** Unit XZ facing direction (dash direction when standing still). */
  facing: [number, number];
  flames: number;
  carried: number;
  invulnTicks: number;
  dashCdTicks: number;
  pulseCdTicks: number;
  charmTicks: number;
  dashLeft: number;
  dashDir: [number, number];
  /** Horizontal launch velocity from a bounce pad, kept until landing (A5). */
  launch: [number, number] | null;
  /** > 0 while waiting to respawn after a fall (A7). */
  respawnTicks: number;
  falling: boolean;
}

export interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export type ShadeState = "spawning" | "wander" | "chase" | "recoil" | "stunned";
export const SHADE_STATES: readonly ShadeState[] = ["spawning", "wander", "chase", "recoil", "stunned"];

export interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  /** Remaining ticks of a timed state (spawning / recoil / stunned). */
  ticks: number;
  hover: number;
  /** Remaining pushback / recoil steps and their per-tick XZ displacement. */
  pushLeft: number;
  pushStep: [number, number];
  wanderTarget: Vec3 | null;
  wanderTicks: number;
}

export type DrifterState = "idle" | "chase" | "flee" | "removed";
export const DRIFTER_STATES: readonly DrifterState[] = ["idle", "chase", "flee", "removed"];

export interface Drifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  /** Remaining flee ticks before removal. */
  ticks: number;
  wanderTarget: Vec3 | null;
  wanderTicks: number;
}

export interface Mote {
  id: string;
  pos: Vec3;
  kind: "random" | "dropped";
  /** Remaining life of a dropped mote (ticks); null for random motes. */
  ttl: number | null;
  /** Index into the night's mote spawn points (random motes only). */
  spawnIdx: number | null;
}

export interface Charm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface Wind {
  active: boolean;
  dirDeg: number;
  /** Ticks until the next gust starts while it is announced (for the renderer's leaves). */
  warning: boolean;
}

export interface SimEvent {
  name:
    | "mote_picked"
    | "deposit"
    | "lantern_lit"
    | "pulse"
    | "player_hit"
    | "shade_spawned"
    | "game_over"
    | "dash"
    | "charm_picked"
    | "drifter_steal"
    | "drifter_drop"
    | "night_start"
    | "paused"
    | "resumed";
  data: Record<string, unknown>;
}

export interface World {
  rng: Rng;
  map: NightMap;
  randomShades: boolean;
  randomMotes: boolean;
  randomDrifters: boolean;
  windEnabled: boolean;
  /** Contract tick (steps run, including paused ones). */
  steps: number;
  /** True once the first step ran (night_start emitted). */
  started: boolean;
  /** Gameplay ticks run (frozen while paused). */
  simTicks: number;
  startTimeLeftS: number;
  state: GameState;
  score: number;
  player: Player;
  lanterns: Lantern[];
  shades: Shade[];
  motes: Mote[];
  drifters: Drifter[];
  charms: Charm[];
  wind: Wind;
  nextMoteId: number;
  nextShadeId: number;
  nextDrifterId: number;
  prevInput: InputState;
}
