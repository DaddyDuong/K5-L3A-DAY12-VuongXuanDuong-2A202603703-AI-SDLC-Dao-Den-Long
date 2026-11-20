export type Vec3 = [number, number, number];
export type GameState = "playing" | "won" | "lost";

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
}

export const DEFAULT_INPUT: InputState = {
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
  dash: false,
};

export interface Player {
  pos: Vec3;
  vy: number;
  flames: number;
  carried: number;
}

export interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface Shade {
  id: string;
  pos: Vec3;
  state: string; // must include "stunned"; others are ours (e.g. "chase")
}

export interface Mote {
  id: string;
  pos: Vec3;
}

export interface SimEvent {
  name:
    | "mote_picked"
    | "deposit"
    | "lantern_lit"
    | "pulse"
    | "player_hit"
    | "shade_spawned"
    | "game_over";
  data: Record<string, unknown>;
}

export interface World {
  steps: number;
  startTimeLeftS: number;
  state: GameState;
  score: number;
  player: Player;
  lanterns: Lantern[];
  shades: Shade[];
  motes: Mote[];
  nextMoteId: number;
  nextShadeId: number;
  prevInput: InputState;
}
