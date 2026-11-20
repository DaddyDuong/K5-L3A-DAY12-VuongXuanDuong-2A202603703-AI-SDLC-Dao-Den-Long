// Greedy bot that plays Night 1 through the real sim and records contract-format inputs.
// Used to prove the game is winnable and to produce replays for visual evidence.
import type { InputFrame } from "../sim/inputs.js";
import type { Scenario } from "../sim/scenario.js";
import { distXZ, step } from "../sim/step.js";
import { TUNING } from "../sim/tuning.js";
import { DEFAULT_INPUT, type GameState, type InputState, type Vec3 } from "../sim/types.js";
import { createWorld } from "../sim/world.js";

export interface AutoplayResult {
  frames: InputFrame[];
  state: GameState;
  score: number;
  ticks: number;
  flames: number;
}

const MAX_TURN_DEG = 8; // camera yaw change per tick, keeps the replay camera smooth
const THREAT_M = 3; // pulse when a chasing shade gets this close

export function autoplay(seed: number, scenario: Scenario = {}, maxTicks = 18000): AutoplayResult {
  const w = createWorld(seed, scenario);
  const frames: InputFrame[] = [];
  let yaw = 0;
  let prev: InputState = { ...DEFAULT_INPUT, move: [0, 0] };

  for (let k = 0; k < maxTicks && w.state === "playing"; k++) {
    const p = w.player;
    const unlit = w.lanterns.filter((l) => !l.lit).sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos));
    const lantern = unlit[0]!;
    const need = TUNING.lantern_cost - lantern.deposited;
    const goLantern =
      p.carried >= need || p.carried >= TUNING.carry_capacity || (w.motes.length === 0 && p.carried > 0);
    const nearestMote = [...w.motes].sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
    const target: Vec3 = goLantern || !nearestMote ? lantern.pos : nearestMote.pos;

    const atLantern = goLantern && distXZ(p.pos, lantern.pos) <= TUNING.interact_radius - 0.3;
    const threat = w.shades.some((s) => s.state !== "stunned" && distXZ(p.pos, s.pos) <= THREAT_M);
    const pulseReady = w.steps + 1 >= w.pulseReadyAt && p.carried >= TUNING.pulse_cost;

    // Turn the camera smoothly toward the target, then express the world direction in camera space.
    const dx = target[0] - p.pos[0];
    const dz = target[2] - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const want = (Math.atan2(dx, dz) * 180) / Math.PI;
      const diff = ((want - yaw + 540) % 360) - 180;
      yaw += Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, diff));
      yaw = ((yaw % 360) + 360) % 360;
    }
    const th = (yaw * Math.PI) / 180;
    const [wx, wz] = d > 0.01 && !atLantern ? [dx / d, dz / d] : [0, 0];
    const move: [number, number] = [
      round6(wx * Math.cos(th) - wz * Math.sin(th)),
      round6(wx * Math.sin(th) + wz * Math.cos(th)),
    ];

    const input: InputState = {
      ...DEFAULT_INPUT,
      move,
      cam_yaw_deg: round6(yaw),
      interact: atLantern && !prev.interact,
      pulse: threat && pulseReady && !prev.pulse,
    };
    const frame = diffFrame(k, prev, input);
    if (frame) frames.push(frame);
    prev = input;
    step(w, input);
  }
  return { frames, state: w.state, score: w.score, ticks: w.steps, flames: w.player.flames };
}

function diffFrame(tick: number, a: InputState, b: InputState): InputFrame | null {
  const f: InputFrame = { tick };
  if (a.move[0] !== b.move[0] || a.move[1] !== b.move[1]) f.move = b.move;
  if (a.cam_yaw_deg !== b.cam_yaw_deg) f.cam_yaw_deg = b.cam_yaw_deg;
  if (a.interact !== b.interact) f.interact = b.interact;
  if (a.pulse !== b.pulse) f.pulse = b.pulse;
  return Object.keys(f).length > 1 ? f : null;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
