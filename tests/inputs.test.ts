import { describe, expect, it } from "vitest";
import { InputTimeline, MalformedError, parseInputs, worldMove } from "../src/sim/inputs.js";
import { DEFAULT_INPUT } from "../src/sim/types.js";

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};

describe("worldMove (contract §C)", () => {
  it("yaw 0: x is +X, z is +Z", () => {
    close(worldMove({ ...DEFAULT_INPUT, move: [1, 0] }), [1, 0]);
    close(worldMove({ ...DEFAULT_INPUT, move: [0, 1] }), [0, 1]);
  });
  it("yaw 90: forward (0,1) becomes +X", () => {
    close(worldMove({ ...DEFAULT_INPUT, move: [0, 1], cam_yaw_deg: 90 }), [1, 0]);
    close(worldMove({ ...DEFAULT_INPUT, move: [1, 0], cam_yaw_deg: 90 }), [0, -1]);
  });
  it("normalizes vectors longer than 1, keeps shorter ones", () => {
    const [x, z] = worldMove({ ...DEFAULT_INPUT, move: [1, 1] });
    expect(Math.hypot(x, z)).toBeCloseTo(1, 9);
    close(worldMove({ ...DEFAULT_INPUT, move: [0, 0.5] }), [0, 0.5]);
  });
});

describe("parseInputs", () => {
  it("rejects non-increasing ticks", () => {
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(MalformedError);
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 3 }] })).toThrow(MalformedError);
  });
  it("rejects missing frames and bad types", () => {
    expect(() => parseInputs({})).toThrow(MalformedError);
    expect(() => parseInputs({ frames: [{ tick: 0, jump: 1 }] })).toThrow(MalformedError);
    expect(() => parseInputs({ frames: [{ tick: 0, move: [1] }] })).toThrow(MalformedError);
  });
});

describe("InputTimeline", () => {
  it("absent fields keep their previous value", () => {
    const tl = new InputTimeline(
      parseInputs({ frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 30 }, { tick: 10, interact: true }] }),
    );
    expect(tl.at(0)).toMatchObject({ move: [0, 1], cam_yaw_deg: 30, interact: false });
    expect(tl.at(9).interact).toBe(false);
    expect(tl.at(10)).toMatchObject({ move: [0, 1], cam_yaw_deg: 30, interact: true });
  });
});
