import { DEFAULT_INPUT, type InputState } from "./types.js";

export class MalformedError extends Error {}

export interface InputFrame extends Partial<InputState> {
  tick: number;
}

const BUTTONS = ["jump", "interact", "pulse", "dash"] as const;

/** Validate a parsed inputs JSON document. Throws MalformedError (exit code 2). */
export function parseInputs(raw: unknown): InputFrame[] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { frames?: unknown }).frames)) {
    throw new MalformedError("inputs: expected an object with a 'frames' array");
  }
  const frames: InputFrame[] = [];
  let lastTick = -1;
  for (const [i, f] of ((raw as { frames: unknown[] }).frames).entries()) {
    if (typeof f !== "object" || f === null) throw new MalformedError(`inputs: frame ${i} is not an object`);
    const o = f as Record<string, unknown>;
    if (!Number.isInteger(o.tick) || (o.tick as number) < 0) {
      throw new MalformedError(`inputs: frame ${i} has invalid 'tick'`);
    }
    const tick = o.tick as number;
    if (tick <= lastTick) throw new MalformedError(`inputs: frame ${i} tick ${tick} is not strictly increasing`);
    lastTick = tick;
    const frame: InputFrame = { tick };
    if ("move" in o) {
      const m = o.move;
      if (!Array.isArray(m) || m.length !== 2 || !m.every((v) => typeof v === "number" && Number.isFinite(v))) {
        throw new MalformedError(`inputs: frame ${i} has invalid 'move'`);
      }
      // Assumption: components outside [-1, 1] are clamped rather than rejected.
      frame.move = [clamp(m[0] as number, -1, 1), clamp(m[1] as number, -1, 1)];
    }
    if ("cam_yaw_deg" in o) {
      if (typeof o.cam_yaw_deg !== "number" || !Number.isFinite(o.cam_yaw_deg)) {
        throw new MalformedError(`inputs: frame ${i} has invalid 'cam_yaw_deg'`);
      }
      frame.cam_yaw_deg = o.cam_yaw_deg;
    }
    for (const b of BUTTONS) {
      if (b in o) {
        if (typeof o[b] !== "boolean") throw new MalformedError(`inputs: frame ${i} has non-boolean '${b}'`);
        frame[b] = o[b] as boolean;
      }
    }
    frames.push(frame);
  }
  return frames;
}

/** Resolves the held input state for each tick (absent fields keep their previous value). */
export class InputTimeline {
  private idx = 0;
  private current: InputState = { ...DEFAULT_INPUT, move: [0, 0] };
  constructor(private readonly frames: InputFrame[]) {}

  /** Must be called with non-decreasing ticks. */
  at(tick: number): InputState {
    while (this.idx < this.frames.length && this.frames[this.idx]!.tick <= tick) {
      const { tick: _t, ...rest } = this.frames[this.idx]!;
      this.current = { ...this.current, ...rest };
      this.idx++;
    }
    return this.current;
  }
}

/** Contract §C: normalize if longer than 1, then rotate by camera yaw into world XZ. */
export function worldMove(input: InputState): [number, number] {
  let [x, z] = input.move;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  const th = (input.cam_yaw_deg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [x * c + z * s, -x * s + z * c];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
