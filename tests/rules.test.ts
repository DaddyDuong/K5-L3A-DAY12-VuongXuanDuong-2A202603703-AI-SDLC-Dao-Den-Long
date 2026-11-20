// Phase 1 acceptance criteria (docs/notes/phase-1-assumptions.md) re-checked with the Ticket-02 standard numbers.
// Expectations that changed are marked "Ticket-02:" with the reason (see docs/notes/phase-2-assumptions.md §1).
import { describe, expect, it } from "vitest";
import { events, press, run, runCli, scn, snap, xz } from "./helpers.js";

describe("R1 pickup", () => {
  it("AC1: mote within pickup_radius is picked on tick 1 (Ticket-02: no score for picking)", () => {
    const r = run(1, scn({ motes: [[0, 0, 1]] }));
    expect(r.code).toBe(0);
    expect(events(r, "mote_picked")).toEqual([{ type: "event", tick: 1, name: "mote_picked", data: { carried: 1 } }]);
    expect(snap(r, 1)).toMatchObject({ score: 0, motes_active: 0, player: { carried: 1 } });
  });

  it("AC1b: radius is inclusive (Ticket-02: exactly 1.0 m is picked)", () => {
    expect(events(run(1, scn({ motes: [[0, 0, 1]] })), "mote_picked")).toHaveLength(1);
    expect(events(run(1, scn({ motes: [[0.6, 0, 0.8]] })), "mote_picked")).toHaveLength(1);
  });

  it("AC2: mote just outside pickup_radius is not picked (Ticket-02: 1.1 m)", () => {
    expect(events(run(10, scn({ motes: [[0, 0, 1.1]] })), "mote_picked")).toHaveLength(0);
  });

  it("AC3: full bag leaves motes on the ground (Ticket-02: capacity 10)", () => {
    const r = run(1, scn({ player: { carried: 10 }, motes: [[0, 0, 1]] }));
    expect(events(r, "mote_picked")).toHaveLength(0);
    expect(snap(r, 1).motes_active).toBe(1);
  });

  it("AC3b: several motes in range fill the bag up to capacity, in id order", () => {
    const r = run(1, scn({ player: { carried: 8 }, motes: [[0, 0, 1], [1, 0, 0], [0, 0, -1]] }));
    expect(events(r, "mote_picked").map((e) => e.data.carried)).toEqual([9, 10]);
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
  it("AC4: partial deposit keeps lantern unlit (Ticket-03: +5 per mote deposited, was +10)", () => {
    const r = run(1, scn({ player: { carried: 3 }, lanterns: [{ id: "L1", pos: [0, 0, 1.5] }] }), press("interact"));
    expect(events(r, "deposit")).toEqual([
      { type: "event", tick: 1, name: "deposit", data: { lantern_id: "L1", amount: 3, deposited: 3 } },
    ]);
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(snap(r, 1).player.carried).toBe(0);
    expect(snap(r, 1).score).toBe(15);
    expect(snap(r, 1).lanterns[0]).toMatchObject({ id: "L1", lit: false, deposited: 3 });
  });

  it("AC5: reaching lantern_cost (Ticket-02: 10) lights it in the same tick, +per_lantern", () => {
    const r = run(1, scn({ player: { carried: 10 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }] }), press("interact"));
    const names = r.lines.filter((l) => l.type === "event" && l.name !== "night_start").map((l) => l.name);
    expect(names).toEqual(["deposit", "lantern_lit"]);
    expect(events(r, "lantern_lit")[0]).toMatchObject({ tick: 1, data: { lantern_id: "L1" } });
    expect(snap(r, 1)).toMatchObject({ score: 10 * 5 + 100 }); // Ticket-03: +5 per mote (was +10)
    expect(snap(r, 1).lanterns[0]).toMatchObject({ lit: true, deposited: 10 });
  });

  it("AC5b: only the missing amount is deposited, the rest stays carried", () => {
    const r = run(1, scn({ player: { carried: 4 }, lanterns: [{ id: "L1", pos: [0, 0, 2], deposited: 8 }] }), press("interact"));
    expect(events(r, "deposit")[0]!.data).toEqual({ lantern_id: "L1", amount: 2, deposited: 10 });
    expect(snap(r, 1).player.carried).toBe(2);
  });

  it("AC6: holding interact deposits only once (edge-triggered)", () => {
    const r = run(10, scn({ player: { carried: 10 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }, { id: "L2", pos: [0, 0, -2] }] }), {
      frames: [{ tick: 0, interact: true }],
    });
    expect(events(r, "deposit")).toHaveLength(1);
  });

  it("interact out of range (Ticket-02: 2.0 m) or with empty hands does nothing", () => {
    expect(events(run(1, scn({ player: { carried: 5 }, lanterns: [{ id: "L1", pos: [0, 0, 2.1] }] }), press("interact")), "deposit")).toHaveLength(0);
    expect(events(run(1, scn({ player: { carried: 0 }, lanterns: [{ id: "L1", pos: [0, 0, 2] }] }), press("interact")), "deposit")).toHaveLength(0);
  });

  // Ticket-03 §1 replaces "lit lanterns are skipped": a lit lantern that is not full can receive (refuel). It has
  // already burnt 1/60 in step 2 before the interact of step 5, so the nearest one, L1, takes 1 mote.
  it("nearest receiving lantern wins; a lit, not full lantern is refuelled (Ticket-03)", () => {
    const r = run(1, scn({
      player: { carried: 2 },
      lanterns: [{ id: "L1", pos: [0, 0, 1], lit: true }, { id: "L2", pos: [0, 0, 2] }, { id: "L3", pos: [0, 0, -1.5] }],
    }), press("interact"));
    expect(events(r, "deposit")).toHaveLength(0);
    expect(events(r, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 1, fuel: 100 });
  });

  it("among unlit lanterns the nearest wins", () => {
    const r = run(1, scn({
      player: { carried: 2 },
      lanterns: [{ id: "L2", pos: [0, 0, 2] }, { id: "L3", pos: [0, 0, -1.5] }],
    }), press("interact"));
    expect(events(r, "deposit")[0]!.data.lantern_id).toBe("L3");
  });
});

// R10 is replaced by Ticket-03 §3 ("[THAY THẾ] thắng ngay khi tất cả đèn sáng"): lighting every lantern no
// longer ends the night, and the win (dawn_survived) is only decided at dawn. AC16 / AC17 keep their setups
// but now assert the new rule; the dawn win itself is covered by phase3.test.ts (AC50, AC51).
describe("R10 win (replaced by Ticket-03 §3)", () => {
  it("AC16: lighting the last lantern does NOT end the night any more (no all_lit)", () => {
    const r = run(100, scn({ player: { carried: 10, flames: 3 }, lanterns: litAllBut("L5", [0, 0, 2]) }), press("interact"));
    expect(events(r, "lantern_lit")).toHaveLength(1);
    expect(events(r, "game_over")).toEqual([]);
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 100, state: "playing", score: 10 * 5 + 100 });
  });

  it("AC17: all lanterns pre-lit by scenario: no event, no score, the night goes on", () => {
    const r = run(100, scn({ lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 100, state: "playing", score: 0 });
  });
});

describe("R4/R5/R6 shades", () => {
  it("AC7: a shade chases the player at shade_speed (Ticket-02: 4.0 m/s)", () => {
    const r = run(60, scn({ shades: [{ id: "S1", pos: [10, 0, 0] }] }), undefined, 60);
    expect(snap(r, 60).shades[0]).toEqual({ id: "S1", pos: [6, 0, 0], state: "chase" });
  });

  it("AC15: shades never enter safe_radius (Ticket-02: 6 m) of a lit lantern", () => {
    const r = run(600, scn({
      player: { pos: [0, 0, 10] },
      shades: [{ id: "S1", pos: [0, 1, 20] }, { id: "S2", pos: [-12, 1, 10] }],
      lanterns: [{ id: "L1", pos: [0, 0, 10], lit: true }],
    }));
    expect(events(r, "player_hit")).toHaveLength(0);
    const dists = r.lines.filter((l) => l.type === "snapshot").flatMap((s) => s.shades.map((sh: any) => xz(sh.pos, [0, 0, 10])));
    expect(Math.min(...dists)).toBeGreaterThan(6);
    expect(Math.min(...dists)).toBeLessThan(6.1); // they do come right up to the edge
  });

  it("unlit lanterns give no protection (Ticket-02: the shade hits, then recoils)", () => {
    const r = run(300, scn({ player: { pos: [0, 0, 10] }, shades: [{ id: "S1", pos: [0, 1, 20] }], lanterns: [{ id: "L1", pos: [0, 0, 10] }] }));
    expect(events(r, "player_hit").length).toBeGreaterThan(0);
  });

  it("random_shades:false never spawns; generated ids skip ids taken by the scenario", () => {
    const none = run(1800, scn({ lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] }), undefined, 1800);
    expect(events(none, "shade_spawned")).toHaveLength(0);
    const mixed = run(300, { random_motes: false, shades: [{ id: "S1", pos: [20, 1, 0] }], lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] }, undefined, 300);
    expect(snap(mixed, 0).shades.map((s: any) => s.id)).toEqual(["S1"]);
    expect(events(mixed, "shade_spawned").map((e) => e.data.id)).toEqual(["S2", "S3"]);
  });
});

describe("R7/R11 hits and losing", () => {
  const touching = (extra: Record<string, unknown> = {}) =>
    scn({ player: { flames: 3, carried: 4 }, shades: [{ id: "S1", pos: [0.5, 1, 0] }], ...extra });

  it("AC8: contact costs a flame and drops floor(carried*hit_drop_ratio) motes (Ticket-02: ring 1.5–2.5 m)", () => {
    const r = run(1, touching());
    expect(events(r, "player_hit")).toEqual([
      { type: "event", tick: 1, name: "player_hit", data: { by: "shade", flames: 2, dropped: 2 } },
    ]);
    const s = snap(r, 1);
    expect(s.player).toMatchObject({ flames: 2, carried: 2 });
    expect(s.motes_active).toBe(2);
    for (const m of s.motes) {
      expect(xz(m.pos, [0, 0, 0])).toBeGreaterThanOrEqual(1.5 - 1e-3);
      expect(xz(m.pos, [0, 0, 0])).toBeLessThanOrEqual(2.5 + 1e-3);
      expect(m).toMatchObject({ kind: "dropped", ttl_s: 8 });
    }
  });

  it("dropped motes can be picked up again", () => {
    const r = run(1, touching());
    const dropped = snap(r, 1).motes[0];
    const r2 = run(60, touching({ shades: [], motes: [dropped.pos] }), { frames: [{ tick: 0, move: [dropped.pos[0], dropped.pos[2]] }] }, 60);
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

describe("R8/R9 pulse and stun (Ticket-02 numbers)", () => {
  it("AC11: pulse costs 3, stuns shades within 5 m (3D), +5 each, pushes 4 m over 15 ticks", () => {
    const r = run(15, scn({ player: { carried: 4 }, shades: [{ id: "S1", pos: [4.9, 1, 0] }, { id: "S2", pos: [5.1, 1, 0] }] }), press("pulse"));
    expect(events(r, "pulse")).toEqual([{ type: "event", tick: 1, name: "pulse", data: { stunned_ids: ["S1"] } }]);
    const s = snap(r, 1);
    expect(s.player.carried).toBe(1);
    expect(s.score).toBe(5);
    expect(s.shades[0]).toMatchObject({ id: "S1", state: "stunned" });
    expect(s.shades[1].state).toBe("chase");
    expect(snap(r, 15).shades[0]).toEqual({ id: "S1", pos: [8.9, 1, 0], state: "stunned" });
  });

  it("an empty pulse still fires and costs its motes", () => {
    const empty = run(1, scn({ player: { carried: 3 } }), press("pulse"));
    expect(events(empty, "pulse")[0]!.data).toEqual({ stunned_ids: [] });
    expect(snap(empty, 1).player.carried).toBe(0);
  });

  it("AC12: pulse cooldown (Ticket-02: 3 s = 180 ticks) between pulses", () => {
    const r = run(190, scn({ player: { carried: 10 } }), {
      frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 60, pulse: true }, { tick: 61, pulse: false }, { tick: 180, pulse: true }],
    });
    expect(events(r, "pulse").map((e) => e.tick)).toEqual([1, 181]);
  });

  it("AC13: fewer than pulse_cost (3) motes -> no pulse", () => {
    expect(events(run(1, scn({ player: { carried: 2 }, shades: [{ id: "S1", pos: [2, 1, 0] }] }), press("pulse")), "pulse")).toHaveLength(0);
  });

  it("AC14: stunned shades neither move (after the push) nor hurt for 120 ticks, then act again", () => {
    const r = run(121, scn({ player: { carried: 3 }, shades: [{ id: "S1", pos: [3, 1, 0] }] }), {
      frames: [{ tick: 0, pulse: true, move: [1, 0] }, { tick: 60, move: [0, 0] }],
    }, 1);
    // The player walks up to the frozen shade (distance 1 = shade_hit_radius) but is not hit while it is stunned.
    expect(snap(r, 60).shades[0]).toEqual({ id: "S1", pos: [7, 1, 0], state: "stunned" });
    expect(snap(r, 120).shades[0]).toEqual({ id: "S1", pos: [7, 1, 0], state: "stunned" });
    expect(events(r, "player_hit").map((e) => e.tick)).toEqual([121]);
    expect(snap(r, 121).shades[0].state).toBe("recoil");
  });

  it("Ticket-02: re-stunning an already stunned shade scores +5 again", () => {
    const r = run(182, scn({ player: { carried: 10 }, shades: [{ id: "S1", pos: [2, 1, 0] }] }), {
      frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 100, move: [1, 0] }, { tick: 110, move: [0, 0] }, { tick: 180, pulse: true }],
    });
    expect(events(r, "pulse").map((e) => e.data.stunned_ids)).toEqual([["S1"], ["S1"]]);
    expect(snap(r, 182).score).toBe(10);
  });
});

describe("AC20 determinism with all rules active", () => {
  // Default night (random motes and shades), starting with a full bag so pulses can fire: walk a ~12 m circle
  // (stays on the island now that falling is enabled), pulse + interact every second, dash every 5 s,
  // then stand still so the shades (4 m/s, slower than the player) catch up.
  const frames: Record<string, unknown>[] = [];
  for (let t = 0; t < 4200; t += 60) {
    const a = t / 120;
    const move = t < 2400 ? [Math.round(Math.cos(a) * 1e6) / 1e6, Math.round(Math.sin(a) * 1e6) / 1e6] : [0, 0];
    frames.push({ tick: t, move, pulse: true, interact: true, dash: t % 300 === 0 });
    frames.push({ tick: t + 1, pulse: false, interact: false, dash: false });
  }
  const scenario = { player: { carried: 10 } };
  const args = ["--seed", "12345", "--night", "1", "--ticks", "4200"];

  it("same seed + inputs -> byte-identical output, and the run really exercises the rules", () => {
    const a = runCli(args, { inputs: { frames }, scenario });
    const b = runCli(args, { inputs: { frames }, scenario });
    expect(a.code).toBe(0);
    expect(a.raw).toBe(b.raw);
    for (const name of ["mote_picked", "pulse", "player_hit", "shade_spawned", "dash", "deposit"]) {
      expect(events(a, name).length, name).toBeGreaterThan(0);
    }
  });

  it("a different seed changes the outcome", () => {
    const c = runCli(["--seed", "999", ...args.slice(2)], { inputs: { frames }, scenario });
    const a = runCli(args, { inputs: { frames }, scenario });
    expect(c.raw).not.toBe(a.raw);
  });
});
