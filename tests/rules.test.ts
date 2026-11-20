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

const litAllBut = (id: string, pos: number[]) =>
  ["L1", "L2", "L3", "L4", "L5"].map((l) => (l === id ? { id: l, pos } : { id: l, lit: true }));

describe("R2/R3 deposit and light", () => {
  it("AC4: partial deposit keeps lantern unlit", () => {
    const r = run(1, scn({ player: { carried: 3 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }] }), press("interact"));
    expect(events(r, "deposit")).toEqual([
      { type: "event", tick: 1, name: "deposit", data: { lantern_id: "L1", amount: 3, deposited: 3 } },
    ]);
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(snap(r, 1).player.carried).toBe(0);
    expect(snap(r, 1).lanterns[0]).toMatchObject({ id: "L1", lit: false, deposited: 3 });
  });

  it("AC5: reaching lantern_cost lights it in the same tick, +per_lantern", () => {
    const r = run(1, scn({ player: { carried: 5 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }] }), press("interact"));
    const names = r.lines.filter((l) => l.type === "event").map((l) => l.name);
    expect(names).toEqual(["deposit", "lantern_lit"]);
    expect(events(r, "lantern_lit")[0]).toMatchObject({ tick: 1, data: { lantern_id: "L1" } });
    expect(snap(r, 1)).toMatchObject({ score: 100 });
    expect(snap(r, 1).lanterns[0]).toMatchObject({ lit: true, deposited: 5 });
  });

  it("AC5b: only the missing amount is deposited, the rest stays carried", () => {
    const r = run(1, scn({ player: { carried: 4 }, lanterns: [{ id: "L1", pos: [0, 0, 2], deposited: 3 }] }), press("interact"));
    expect(events(r, "deposit")[0]!.data).toEqual({ lantern_id: "L1", amount: 2, deposited: 5 });
    expect(snap(r, 1).player.carried).toBe(2);
  });

  it("AC6: holding interact deposits only once (edge-triggered)", () => {
    const r = run(10, scn({ player: { carried: 5 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }, { id: "L2", pos: [0, 0, -2] }] }), {
      frames: [{ tick: 0, interact: true }],
    });
    expect(events(r, "deposit")).toHaveLength(1);
  });

  it("interact out of range or with empty hands does nothing", () => {
    expect(events(run(1, scn({ player: { carried: 5 }, lanterns: [{ id: "L1", pos: [0, 0, 2.6] }] }), press("interact")), "deposit")).toHaveLength(0);
    expect(events(run(1, scn({ player: { carried: 0 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }] }), press("interact")), "deposit")).toHaveLength(0);
  });

  it("nearest unlit lantern wins; lit lanterns are skipped", () => {
    const r = run(1, scn({
      player: { carried: 2 },
      lanterns: [{ id: "L1", pos: [0, 0, 1], lit: true }, { id: "L2", pos: [0, 0, 2] }, { id: "L3", pos: [0, 0, -1.5] }],
    }), press("interact"));
    expect(events(r, "deposit")[0]!.data.lantern_id).toBe("L3");
  });
});

describe("R10 win", () => {
  it("AC16: lighting the last lantern wins with time + flame bonus", () => {
    const r = run(100, scn({ player: { carried: 5, flames: 3 }, lanterns: litAllBut("L5", [0, 0, 2]) }), press("interact"));
    expect(events(r, "game_over")).toEqual([
      { type: "event", tick: 1, name: "game_over", data: { result: "won", reason: "all_lit" } },
    ]);
    // 100 lantern + 2 * floor(300 - 1/60) + 50 * 3
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 1, state: "won", score: 100 + 2 * 299 + 150 });
  });

  it("AC17: all lanterns pre-lit by scenario wins at tick 1 without per_lantern", () => {
    const r = run(100, scn({ lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 1, state: "won", score: 2 * 299 + 50 * 3 });
  });
});
