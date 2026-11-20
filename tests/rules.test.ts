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

const xz = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

describe("R4/R5/R6 shades", () => {
  it("AC7: a shade chases the player at shade_speed", () => {
    const r = run(60, scn({ shades: [{ id: "S1", pos: [10, 0, 0] }] }), undefined, 60);
    expect(snap(r, 60).shades[0]).toEqual({ id: "S1", pos: [6.5, 0, 0], state: "chase" });
  });

  it("AC15: shades never enter safe_radius of a lit lantern", () => {
    const r = run(600, scn({
      player: { pos: [0, 0, 10] },
      shades: [{ id: "S1", pos: [0, 1, 20] }, { id: "S2", pos: [-12, 1, 10] }],
      lanterns: [{ id: "L1", pos: [0, 0, 10], lit: true }],
    }));
    expect(events(r, "player_hit")).toHaveLength(0);
    const dists = r.lines.filter((l) => l.type === "snapshot").flatMap((s) => s.shades.map((sh: any) => xz(sh.pos, [0, 0, 10])));
    expect(Math.min(...dists)).toBeGreaterThan(5);
    expect(Math.min(...dists)).toBeLessThan(5.1); // they do come right up to the edge
  });

  it("unlit lanterns give no protection", () => {
    const r = run(300, scn({ player: { pos: [0, 0, 10] }, shades: [{ id: "S1", pos: [0, 1, 20] }], lanterns: [{ id: "L1", pos: [0, 0, 10] }] }), undefined, 300);
    expect(xz(snap(r, 300).shades[0].pos, [0, 0, 10])).toBeLessThan(1);
  });

  it("AC18: default night starts with 3 rim shades (no events) and spawns one every 30 s", () => {
    // Player sits inside a lit lantern so the shades cannot end the game early.
    const r = runCli([...BASE, "--ticks", "1801", "--snapshot-every", "1800"], {
      scenario: { random_motes: false, lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] },
    });
    const s0 = snap(r, 0);
    expect(s0.shades.map((s: any) => s.id)).toEqual(["S1", "S2", "S3"]);
    for (const s of s0.shades) {
      expect(xz(s.pos, [0, 0, 0])).toBeCloseTo(38, 2);
      expect(s.pos[1]).toBe(1);
    }
    const spawned = events(r, "shade_spawned");
    expect(spawned).toEqual([{ type: "event", tick: 1800, name: "shade_spawned", data: { id: "S4" } }]);
    expect(snap(r, 1800).shades).toHaveLength(4);
  });

  it("random_shades:false never spawns; generated ids skip ids taken by the scenario", () => {
    const none = run(1800, scn({ lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] }), undefined, 1800);
    expect(events(none, "shade_spawned")).toHaveLength(0);
    const mixed = runCli([...BASE, "--ticks", "1800", "--snapshot-every", "1800"], {
      scenario: { random_motes: false, shades: [{ id: "S1", pos: [20, 1, 0] }], lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] },
    });
    expect(snap(mixed, 0).shades.map((s: any) => s.id)).toEqual(["S1"]);
    expect(events(mixed, "shade_spawned")[0]!.data.id).toBe("S2");
  });
});

describe("R7/R11 hits and losing", () => {
  const touching = (extra: Record<string, unknown> = {}) =>
    scn({ player: { flames: 3, carried: 4 }, shades: [{ id: "S1", pos: [0.5, 1, 0] }], ...extra });

  it("AC8: contact costs a flame and drops floor(carried*hit_drop_ratio) motes 3 m away", () => {
    const r = run(1, touching());
    expect(events(r, "player_hit")).toEqual([
      { type: "event", tick: 1, name: "player_hit", data: { by: "shade", flames: 2, dropped: 2 } },
    ]);
    const s = snap(r, 1);
    expect(s.player).toMatchObject({ flames: 2, carried: 2 });
    expect(s.motes_active).toBe(2);
    for (const m of s.motes) expect(xz(m.pos, [0, 0, 0])).toBeCloseTo(3, 2);
  });

  it("dropped motes can be picked up again", () => {
    const r = run(1, touching());
    const dropped = snap(r, 1).motes[0];
    const r2 = run(60, touching({ shades: [] , motes: [dropped.pos] }), { frames: [{ tick: 0, move: [0, 1] }] }, 60);
    expect(events(r2, "mote_picked")).toHaveLength(1);
  });

  it("AC9: invulnerable for invuln_s (90 ticks) after a hit", () => {
    expect(events(run(90, touching()), "player_hit").map((e) => e.tick)).toEqual([1]);
    expect(events(run(91, touching()), "player_hit").map((e) => e.tick)).toEqual([1, 91]);
  });

  it("carrying 1 mote drops 0 (floor)", () => {
    expect(events(run(1, touching({ player: { flames: 3, carried: 1 } })), "player_hit")[0]!.data.dropped).toBe(0);
  });

  it("AC10: losing the last flame ends the game (no_flames)", () => {
    const r = run(100, touching({ player: { flames: 1, carried: 0 } }));
    expect(events(r, "game_over")).toEqual([
      { type: "event", tick: 1, name: "game_over", data: { result: "lost", reason: "no_flames" } },
    ]);
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 1, state: "lost", score: 0 });
  });

  it("only one hit per tick even with several shades touching", () => {
    const r = run(1, touching({ shades: [{ id: "S1", pos: [0.5, 1, 0] }, { id: "S2", pos: [-0.5, 1, 0] }] }));
    expect(events(r, "player_hit")).toHaveLength(1);
  });
});

describe("R8/R9 pulse and stun", () => {
  it("AC11: pulse costs pulse_cost, stuns and pushes shades in radius, +per_stun", () => {
    const r = run(1, scn({ player: { carried: 2 }, shades: [{ id: "S1", pos: [5, 1, 0] }, { id: "S2", pos: [6.1, 1, 0] }] }), press("pulse"));
    expect(events(r, "pulse")).toEqual([{ type: "event", tick: 1, name: "pulse", data: { stunned_ids: ["S1"] } }]);
    const s = snap(r, 1);
    expect(s.player.carried).toBe(1);
    expect(s.score).toBe(25);
    expect(s.shades[0]).toEqual({ id: "S1", pos: [9, 1, 0], state: "stunned" });
    expect(s.shades[1].state).toBe("chase");
  });

  it("pulse radius is inclusive and an empty pulse still fires", () => {
    expect(events(run(1, scn({ player: { carried: 1 }, shades: [{ id: "S1", pos: [6, 1, 0] }] }), press("pulse")), "pulse")[0]!.data)
      .toEqual({ stunned_ids: ["S1"] });
    const empty = run(1, scn({ player: { carried: 1 } }), press("pulse"));
    expect(events(empty, "pulse")[0]!.data).toEqual({ stunned_ids: [] });
    expect(snap(empty, 1).player.carried).toBe(0);
  });

  it("AC12: pulse_cooldown_s (60 ticks) between pulses", () => {
    const r = run(70, scn({ player: { carried: 5 } }), {
      frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 30, pulse: true }, { tick: 31, pulse: false }, { tick: 60, pulse: true }],
    });
    expect(events(r, "pulse").map((e) => e.tick)).toEqual([1, 61]);
  });

  it("AC13: no motes carried -> no pulse", () => {
    expect(events(run(1, scn({ player: { carried: 0 }, shades: [{ id: "S1", pos: [2, 1, 0] }] }), press("pulse")), "pulse")).toHaveLength(0);
  });

  it("AC14: stunned shades neither move nor hurt for pulse_stun_s, then chase again", () => {
    const r = run(181, scn({ player: { carried: 2 }, shades: [{ id: "S1", pos: [3, 1, 0] }] }), {
      frames: [{ tick: 0, pulse: true, move: [1, 0] }, { tick: 60, move: [0, 0] }],
    }, 1);
    // Player walks up to the frozen shade (distance ~1 = shade_hit_radius) but is not hit while it is stunned.
    expect(snap(r, 60).shades[0]).toEqual({ id: "S1", pos: [7, 1, 0], state: "stunned" });
    expect(snap(r, 180).shades[0]).toEqual({ id: "S1", pos: [7, 1, 0], state: "stunned" });
    expect(snap(r, 181).shades[0].state).toBe("chase");
    expect(events(r, "player_hit").map((e) => e.tick)).toEqual([181]);
  });

  it("re-stunning an already stunned shade gives no extra score", () => {
    const r = run(62, scn({ player: { carried: 5 }, shades: [{ id: "S1", pos: [2, 1, 0] }] }), {
      frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 60, pulse: true }],
    });
    expect(events(r, "pulse").map((e) => e.data.stunned_ids)).toEqual([["S1"], ["S1"]]);
    expect(snap(r, 62).score).toBe(25);
  });
});

describe("AC20 determinism with all rules active", () => {
  // Wander around the default night (changing heading, pulsing and interacting every second), then stand
  // still for the last 20 s: the player (6 m/s) outruns shades (3.5 m/s), so only standing still gets hit.
  const frames: Record<string, unknown>[] = [];
  for (let t = 0; t < 3600; t += 60) {
    const move = t < 2400 ? [Math.sin(t / 300), 1] : [0, 0];
    frames.push({ tick: t, move, cam_yaw_deg: (t / 4) % 360, pulse: true, interact: true });
    frames.push({ tick: t + 1, pulse: false, interact: false });
  }
  const args = ["--seed", "12345", "--night", "1", "--ticks", "3600"];

  it("same seed + inputs -> byte-identical output, and the run really exercises the rules", () => {
    const a = runCli(args, { inputs: { frames } });
    const b = runCli(args, { inputs: { frames } });
    expect(a.code).toBe(0);
    expect(a.raw).toBe(b.raw);
    for (const name of ["mote_picked", "pulse", "player_hit", "shade_spawned"]) {
      expect(events(a, name).length, name).toBeGreaterThan(0);
    }
  });

  it("a different seed changes the outcome", () => {
    const c = runCli(["--seed", "999", ...args.slice(2)], { inputs: { frames } });
    const a = runCli(args, { inputs: { frames } });
    expect(c.raw).not.toBe(a.raw);
  });
});
