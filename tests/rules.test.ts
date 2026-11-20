// Acceptance criteria AC1..AC20 from docs/notes/phase-1-assumptions.md, checked through the real CLI.
import { describe, expect, it } from "vitest";
import { runCli, type HeadlessResult } from "./helpers.js";

const BASE = ["--seed", "7", "--night", "1"];
/** Isolated scenario: nothing random unless the test adds it. */
const scn = (extra: Record<string, unknown>) => ({ random_motes: false, random_shades: false, ...extra });
const run = (ticks: number, scenario: unknown, inputs?: unknown, every = 1) =>
  runCli([...BASE, "--ticks", String(ticks), "--snapshot-every", String(every)], {
    scenario,
    ...(inputs ? { inputs } : {}),
  });
const events = (r: HeadlessResult, name: string) => r.lines.filter((l) => l.type === "event" && l.name === name);
const snap = (r: HeadlessResult, tick: number) => r.lines.find((l) => l.type === "snapshot" && l.tick === tick)!;
const press = (button: string, at = 0) => ({ frames: [{ tick: at, [button]: true }] });

describe("R1 pickup", () => {
  it("AC1: mote within pickup_radius is picked on tick 1, +per_mote", () => {
    const r = run(1, scn({ motes: [[0, 0, 1]] }));
    expect(r.code).toBe(0);
    expect(events(r, "mote_picked")).toEqual([{ type: "event", tick: 1, name: "mote_picked", data: { carried: 1 } }]);
    expect(snap(r, 1)).toMatchObject({ score: 10, motes_active: 0, player: { carried: 1 } });
  });

  it("AC1b: radius is inclusive (exactly 1.5 m is picked)", () => {
    expect(events(run(1, scn({ motes: [[0, 0, 1.5]] })), "mote_picked")).toHaveLength(1);
  });

  it("AC2: mote just outside pickup_radius is not picked", () => {
    expect(events(run(10, scn({ motes: [[0, 0, 1.6]] })), "mote_picked")).toHaveLength(0);
  });

  it("AC3: full bag leaves motes on the ground", () => {
    const r = run(1, scn({ player: { carried: 5 }, motes: [[0, 0, 1]] }));
    expect(events(r, "mote_picked")).toHaveLength(0);
    expect(snap(r, 1).motes_active).toBe(1);
  });

  it("AC3b: several motes in range fill the bag up to capacity, in id order", () => {
    const r = run(1, scn({ player: { carried: 3 }, motes: [[0, 0, 1], [1, 0, 0], [0, 0, -1]] }));
    expect(events(r, "mote_picked").map((e) => e.data.carried)).toEqual([4, 5]);
    expect(snap(r, 1).motes.map((m: any) => m.id)).toEqual(["M3"]);
  });

  it("walking onto a mote picks it up", () => {
    const r = run(60, scn({ motes: [[0, 0, 5]] }), { frames: [{ tick: 0, move: [0, 1] }] }, 60);
    expect(events(r, "mote_picked")).toHaveLength(1);
  });
});
