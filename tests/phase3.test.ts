// Ticket-03 acceptance criteria AC47–AC57 (docs/notes/phase-3-assumptions.md §4), checked through the real CLI.
// Fuel is traced in units of 1/60 (100 fuel = 6000): step 2 burns 1 unit per lit lantern and 5 per draining shade
// before the interact of step 5, and a lantern whose fuel reaches ≤ 0 goes out right after step 2.
import { describe, expect, it } from "vitest";
import { events, press, run, runCli, scn, snap, xz } from "./helpers.js";

const L = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });
const lit = (...ids: string[]) => ids.map((id) => L(id, { lit: true }));
const go = (r: ReturnType<typeof run>) => events(r, "game_over").map((e) => [e.tick, e.data]);

describe("AC48 fuel: 100 on light, −1/s while lit, snapshot fields", () => {
  it("a lit lantern burns 1 fuel per second; unlit lanterns show fuel 0", () => {
    const r = run(60, scn({ lanterns: lit("L1") }), undefined, 60);
    expect(snap(r, 0).lanterns[0]).toEqual({ id: "L1", pos: [0, 0, 25], lit: true, deposited: 0, fuel: 100, ever_lit: true, relit_count: 0 });
    expect(snap(r, 0).lanterns[1]).toMatchObject({ lit: false, fuel: 0, ever_lit: false, relit_count: 0 });
    expect(snap(r, 60).lanterns[0].fuel).toBe(99);
  });

  it("lighting sets fuel 100 and lantern_lit says relight: false the first time", () => {
    const r = run(1, scn({ player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1.5] })] }), press("interact"));
    expect(events(r, "lantern_lit")[0]!.data).toEqual({ lantern_id: "L1", relight: false });
    expect(snap(r, 1).lanterns[0]).toMatchObject({ lit: true, fuel: 100, ever_lit: true, relit_count: 0 });
  });

  it("fuel is output with one decimal", () => {
    // 50 fuel = 3000 units, minus 7 = 2993 units = 49.883 -> 49.9
    const r = run(7, scn({ lanterns: [L("L1", { lit: true, fuel: 50 })] }));
    expect(snap(r, 7).lanterns[0].fuel).toBe(49.9);
  });
});

describe("AC49 a lantern with fuel ≤ 0 goes out", () => {
  it("fuel 0.5 lasts 30 ticks: lantern_out, unlit, deposited 0, fuel 0, ever_lit stays true", () => {
    const r = run(40, scn({ lanterns: [L("L1", { lit: true, fuel: 0.5, deposited: 10 })] }));
    expect(events(r, "lantern_out").map((e) => [e.tick, e.data])).toEqual([[30, { lantern_id: "L1" }]]);
    expect(snap(r, 29).lanterns[0]).toMatchObject({ lit: true, deposited: 10 });
    expect(snap(r, 30).lanterns[0]).toMatchObject({ lit: false, deposited: 0, fuel: 0, ever_lit: true });
  });
});

describe("AC50 refuel", () => {
  it("fuel 50: used = ceil((100 − 49.983) / 10) = 6, fuel capped at 100, +5 per mote", () => {
    const r = run(1, scn({ player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1.5], lit: true, fuel: 50 })] }), press("interact"));
    expect(events(r, "refuel")).toEqual([{ type: "event", tick: 1, name: "refuel", data: { lantern_id: "L1", amount: 6, fuel: 100 } }]);
    expect(events(r, "deposit")).toHaveLength(0);
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(snap(r, 1).player.carried).toBe(4);
    expect(snap(r, 1).score).toBe(30);
  });

  it("carrying fewer than needed puts everything in: fuel 20 + 3 motes -> 49.983 + 30", () => {
    const r = run(1, scn({ player: { carried: 3 }, lanterns: [L("L1", { pos: [0, 0, 1.5], lit: true, fuel: 20 })] }), press("interact"));
    expect(events(r, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 3, fuel: 50 });
    expect(snap(r, 1)).toMatchObject({ score: 15, player: { carried: 0 } });
  });
});

describe("AC51 relight costs 5 for a lantern that was lit before", () => {
  it("ever_lit: 5 motes relight it, +5 × 5 + 40, relit_count 1, fuel 100", () => {
    const r = run(1, scn({ player: { carried: 7 }, lanterns: [L("L1", { pos: [0, 0, 1.5], ever_lit: true })] }), press("interact"));
    expect(events(r, "deposit")[0]!.data).toEqual({ lantern_id: "L1", amount: 5, deposited: 5 });
    expect(events(r, "lantern_lit")[0]!.data).toEqual({ lantern_id: "L1", relight: true });
    expect(snap(r, 1)).toMatchObject({ score: 25 + 40, player: { carried: 2 } });
    expect(snap(r, 1).lanterns[0]).toMatchObject({ lit: true, fuel: 100, relit_count: 1, ever_lit: true });
  });

  it("a lantern never lit still needs 10", () => {
    const r = run(1, scn({ player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1.5] })] }), press("interact"));
    expect(events(r, "lantern_lit")).toHaveLength(0);
    expect(snap(r, 1).lanterns[0]).toMatchObject({ lit: false, deposited: 5 });
  });

  it("goes out at tick 6, relit with 5 motes at tick 11", () => {
    const r = run(12, scn({ player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1.5], lit: true, fuel: 0.1 })] }), press("interact", 10));
    expect(events(r, "lantern_out").map((e) => e.tick)).toEqual([6]);
    expect(events(r, "lantern_lit").map((e) => [e.tick, e.data.relight])).toEqual([[11, true]]);
  });
});

describe("AC52 capacity = 10 + 2 × successful_lights, max 20", () => {
  const motes = Array.from({ length: 25 }, () => [0, 0, 0.5]);
  for (const [lights, cap] of [[0, 10], [1, 12], [5, 20], [7, 20]] as const) {
    it(`successful_lights ${lights} -> capacity ${cap}, picks up to ${cap}`, () => {
      const r = run(1, scn({ player: { successful_lights: lights }, motes }));
      expect(snap(r, 1).player).toMatchObject({ capacity: cap, carried: cap });
    });
  }

  it("lighting and relighting both count", () => {
    // L1 (tie at 1.5 m, lower id) is lit first. Once lit it has burnt fuel, so it would take the next press as a
    // refuel: walk 1 m toward L2 (L1 then 2.5 m away) before relighting L2.
    const r = run(12, scn({ player: { carried: 15 }, lanterns: [L("L1", { pos: [0, 0, 1.5] }), L("L2", { pos: [0, 0, -1.5], ever_lit: true })] }), {
      frames: [{ tick: 0, interact: true }, { tick: 1, interact: false, move: [0, -1] }, { tick: 11, move: [0, 0], interact: true }],
    });
    expect(snap(r, 1).player.capacity).toBe(12);
    expect(events(r, "lantern_lit").map((e) => e.data)).toEqual([{ lantern_id: "L1", relight: false }, { lantern_id: "L2", relight: true }]);
    expect(snap(r, 12).player.capacity).toBe(14);
  });
});

describe("AC53 a lantern below 30 fuel has no safe zone (exactly 30 still has one)", () => {
  // 30.75 fuel = 1845 units: ≥ 1800 (30.0) after step 2 of ticks 1..45, 1799 at tick 46.
  const r = run(150, scn({ player: { pos: [0, 0, 0.5] }, shades: [{ pos: [0, 0, 8] }], lanterns: [L("L1", { pos: [0, 0, 0], lit: true, fuel: 30.75 })] }));
  it("the chasing shade waits at the 6 m edge until tick 45, then walks in and hits", () => {
    expect(snap(r, 45).shades[0].pos[2]).toBeGreaterThanOrEqual(6);
    expect(snap(r, 46).shades[0].pos[2]).toBeLessThan(6);
    const hits = events(r, "player_hit");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.tick).toBeGreaterThan(46);
  });
});

describe("AC54 wandering shades drain weak lanterns", () => {
  it("wander -> drain within 2 m; 5 + 1 fuel/s; fuel_drain every 60 ticks; out at tick 201, then wander", () => {
    // 20 fuel = 1200 units; tick 1: −1 (decay; the shade only starts draining at step 8); tick k ≥ 2: −6.
    const r = run(205, scn({ player: { pos: [0, 0, -30] }, shades: [{ pos: [0, 0, 18.5], state: "wander" }], lanterns: [L("L1", { pos: [0, 0, 20], lit: true, fuel: 20 })] }));
    expect(snap(r, 1).shades[0].state).toBe("drain");
    expect(snap(r, 2).lanterns[0].fuel).toBe(19.9); // 1193 units
    expect(events(r, "fuel_drain").map((e) => [e.tick, e.data])).toEqual([
      [61, { lantern_id: "L1", shade_id: "S1", fuel: 14 }],
      [121, { lantern_id: "L1", shade_id: "S1", fuel: 8 }],
      [181, { lantern_id: "L1", shade_id: "S1", fuel: 2 }],
    ]);
    expect(events(r, "lantern_out").map((e) => e.tick)).toEqual([201]);
    expect(snap(r, 200).shades[0].state).toBe("drain");
    expect(snap(r, 201).shades[0].state).toBe("wander");
  });

  it("two draining shades add up (1 + 5 + 5 per tick)", () => {
    const r = run(13, scn({ player: { pos: [0, 0, -30] }, shades: [{ pos: [0, 0, 18.5], state: "wander" }, { pos: [0.5, 0, 18.5], state: "wander" }], lanterns: [L("L1", { pos: [0, 0, 20], lit: true, fuel: 20 })] }));
    expect(snap(r, 13).lanterns[0].fuel).toBe(17.8); // 1199 − 11 × 12 = 1067 units
  });

  it("goes to the nearest weak lantern; on a tie the lower id", () => {
    const lanterns = [L("L1", { pos: [0, 0, 20], lit: true, fuel: 20 }), L("L2", { pos: [0, 0, 10], lit: true, fuel: 25 })];
    const tie = run(1, scn({ player: { pos: [0, 0, -30] }, shades: [{ pos: [0, 0, 15], state: "wander" }], lanterns }));
    expect(tie.lines.find((l) => l.tick === 1 && l.type === "snapshot")!.shades[0].pos[2]).toBeGreaterThan(15);
    const nearer = run(1, scn({ player: { pos: [0, 0, -30] }, shades: [{ pos: [0, 0, 14], state: "wander" }], lanterns }));
    expect(snap(nearer, 1).shades[0].pos[2]).toBeLessThan(14);
  });

  it("no weak lantern: heads for the nearest unlit lantern", () => {
    const r = run(10, scn({ player: { pos: [30, 0, 0] }, shades: [{ pos: [0, 0, 2], state: "wander" }], lanterns: [L("L1", { pos: [0, 0, 10], lit: true }), L("L2", { pos: [0, 0, -10] })] }));
    expect(snap(r, 10).shades[0]).toMatchObject({ state: "wander" });
    expect(snap(r, 10).shades[0].pos[2]).toBeCloseTo(2 - 10 * 0.025, 3);
  });

  it("a chasing shade keeps chasing, even past a weak lantern", () => {
    const r = run(5, scn({ player: { pos: [0, 0, 10.5] }, shades: [{ pos: [0, 0, 18.5], state: "chase" }], lanterns: [L("L1", { pos: [0, 0, 20], lit: true, fuel: 20 })] }));
    expect(snap(r, 5).shades[0].state).toBe("chase");
    expect(snap(r, 5).shades[0].pos[2]).toBeLessThan(18.5);
  });
});

describe("AC55 leaving drain", () => {
  const weak = [L("L1", { pos: [0, 0, 20], lit: true, fuel: 20 })];
  const drainer = { pos: [0, 0, 18.5], state: "drain", target_lantern_id: "L1" };

  it("Mây within 6 m -> chase; at 7 m it keeps draining", () => {
    expect(snap(run(1, scn({ player: { pos: [0, 0, 13] }, shades: [drainer], lanterns: weak })), 1).shades[0].state).toBe("chase");
    expect(snap(run(30, scn({ player: { pos: [0, 0, 11.5] }, shades: [drainer], lanterns: weak })), 30).shades[0].state).toBe("drain");
  });

  it("refuelled to ≥ 30 -> wander, pushed out of the 6 m zone within 30 ticks, never hurts meanwhile", () => {
    const r = run(60, scn({
      player: { pos: [0, 0, -1.5], carried: 10 },
      shades: [{ pos: [0, 0, 1.5], state: "drain", target_lantern_id: "L1" }],
      lanterns: [L("L1", { pos: [0, 0, 0], lit: true, fuel: 20 })],
    }), press("interact"));
    expect(events(r, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 9, fuel: 100 });
    expect(snap(r, 1).shades[0].state).toBe("wander");
    expect(xz(snap(r, 31).shades[0].pos, [0, 0, 0])).toBeGreaterThanOrEqual(6);
    expect(events(r, "player_hit")).toHaveLength(0);
  });

  it("pulse on a draining shade: stunned, +15 total; when the stun ends it wanders", () => {
    const r = run(121, scn({ player: { pos: [0, 0, 16], carried: 3 }, shades: [drainer], lanterns: weak }), {
      frames: [{ tick: 0, pulse: true, move: [0, -1] }],
    });
    expect(events(r, "pulse")[0]!.data).toEqual({ stunned_ids: ["S1"] });
    expect(snap(r, 1)).toMatchObject({ score: 15 });
    expect(snap(r, 1).shades[0].state).toBe("stunned");
    expect(snap(r, 120).shades[0].state).toBe("stunned");
    expect(snap(r, 121).shades[0].state).toBe("wander");
  });
});

describe("AC56 win only at dawn with ≥ ceil(0.6 × lanterns) lit", () => {
  // 1 s left = 60 ticks; each lit lantern ends with 6000 − 60 units = 99 fuel -> 50 + 99 at dawn.
  it("night 1: 3 of 5 lit at dawn -> won, dawn_survived, 3 × (50 + 99) + 3 × 50, no time bonus", () => {
    const r = run(100, scn({ time_left_s: 1, lanterns: lit("L1", "L2", "L3") }));
    expect(go(r)).toEqual([[60, { result: "won", reason: "dawn_survived" }]]);
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 60, state: "won", score: 3 * 149 + 150 });
  });

  it("night 1: 2 of 5 -> lost, dawn", () => {
    const r = run(100, scn({ time_left_s: 1, lanterns: lit("L1", "L2") }));
    expect(go(r)).toEqual([[60, { result: "lost", reason: "dawn" }]]);
    expect(r.lines.at(-1)).toMatchObject({ state: "lost", score: 0 });
  });

  it("a lantern going out on the dawn tick does not count", () => {
    const r = run(100, scn({ time_left_s: 1, lanterns: [...lit("L1", "L2"), L("L3", { lit: true, fuel: 1 })] }));
    expect(events(r, "lantern_out").map((e) => e.tick)).toEqual([60]);
    expect(go(r)).toEqual([[60, { result: "lost", reason: "dawn" }]]);
  });

  for (const [night, needed, total] of [[2, 4, 6], [3, 5, 7]] as const) {
    it(`night ${night}: needs ${needed} of ${total}`, () => {
      const ids = Array.from({ length: total }, (_, i) => `L${i + 1}`);
      const won = run(100, scn({ time_left_s: 1, wind_enabled: false, lanterns: lit(...ids.slice(0, needed)) }), undefined, 10, night);
      expect(go(won)).toEqual([[60, { result: "won", reason: "dawn_survived" }]]);
      const lost = run(100, scn({ time_left_s: 1, wind_enabled: false, lanterns: lit(...ids.slice(0, needed - 1)) }), undefined, 10, night);
      expect(go(lost)).toEqual([[60, { result: "lost", reason: "dawn" }]]);
    });
  }

  it("losing the last flame on the dawn tick loses (no_flames first); with flames left it wins", () => {
    const sc = (flames: number) => scn({ time_left_s: 1 / 60, player: { flames }, shades: [{ pos: [0, 0, 0.5] }], lanterns: lit("L1", "L2", "L3") });
    expect(go(run(5, sc(1)))).toEqual([[1, { result: "lost", reason: "no_flames" }]]);
    const w = run(5, sc(3));
    expect(go(w)).toEqual([[1, { result: "won", reason: "dawn_survived" }]]);
    expect(w.lines.at(-1)!.score).toBe(3 * (50 + 99) + 2 * 50); // 5999 units -> floor 99; 2 flames left
  });
});

describe("AC57 scenario v1.2 fields", () => {
  const base = ["--seed", "1", "--night", "1", "--ticks", "1"];
  it("accepts fuel / ever_lit / successful_lights / target_lantern_id / state drain", () => {
    const r = runCli(base, { scenario: { player: { successful_lights: 2 }, lanterns: [{ id: "L1", lit: true, fuel: 12.5, ever_lit: true }], shades: [{ pos: [0, 0, 23], state: "drain", target_lantern_id: "L1" }] } });
    expect(r.code).toBe(0);
    expect(r.lines[0]!.lanterns[0]).toMatchObject({ lit: true, fuel: 12.5, ever_lit: true });
    expect(r.lines[0]!.shades[0].state).toBe("drain");
    expect(r.lines[0]!.player.capacity).toBe(14);
  });

  it("malformed v1.2 fields -> exit 2", () => {
    for (const scenario of [
      { lanterns: [{ id: "L1", fuel: 120 }] },
      { lanterns: [{ id: "L1", fuel: "full" }] },
      { lanterns: [{ id: "L1", ever_lit: "yes" }] },
      { shades: [{ pos: [0, 0, 5], target_lantern_id: "L9" }] },
      { player: { successful_lights: -1 } },
    ]) expect(runCli(base, { scenario }).code, JSON.stringify(scenario)).toBe(2);
  });
});
