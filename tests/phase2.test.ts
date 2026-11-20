// Ticket-02 acceptance criteria AC23–AC43 (docs/notes/phase-2-assumptions.md §4), checked through the real CLI.
import { describe, expect, it } from "vitest";
import { MAPS } from "../src/sim/maps.js";
import { events, press, run, runCli, scn, snap, snaps, xz } from "./helpers.js";

const near = (a: number[], b: number[], eps = 0.01) => a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe("AC23 standard maps", () => {
  const expected = {
    1: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
    2: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
    3: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
  } as const;
  for (const n of [1, 2, 3] as const) {
    it(`night ${n}: lanterns, 20 motes on distinct spawn points, start, duration`, () => {
      const s = runCli(["--seed", "5", "--night", String(n), "--ticks", "0"]).lines[0]!;
      expect(s.night).toBe(n);
      expect(s.lanterns.map((l: any) => l.pos)).toEqual(expected[n]);
      expect(s.lanterns.map((l: any) => l.id)).toEqual(expected[n].map((_, i) => `L${i + 1}`));
      expect(s.motes).toHaveLength(20);
      const keys = new Set(s.motes.map((m: any) => m.pos.join(",")));
      expect(keys.size).toBe(20);
      const spawns = new Set(MAPS[n].moteSpawns.map((p) => p.join(",")));
      for (const m of s.motes) expect(spawns.has(m.pos.join(","))).toBe(true);
      expect(s.player.pos).toEqual(n === 3 ? [0, 0, -30] : [0, 0, 0]);
      expect(s.time_left_s).toBe({ 1: 240, 2: 270, 3: 300 }[n]); // Ticket-03 §3 (was 300 / 330 / 360)
      expect(s.shades).toEqual([]);
    });
  }
  it("night 3 spawn tiers: 18 on tier 0, 8 on tier 1 (y 3), 4 on tier 2 (y 6)", () => {
    const ys = MAPS[3].moteSpawns.map((p) => p[1]);
    expect([ys.filter((y) => y === 0).length, ys.filter((y) => y === 3).length, ys.filter((y) => y === 6).length]).toEqual([18, 8, 4]);
  });
});

describe("AC25 pickup with height (XZ ≤ 1.0 and |Δy| ≤ 1.5)", () => {
  it("mote 1.5 m above is picked, 1.6 m is not", () => {
    expect(events(run(1, scn({ motes: [[0, 1.5, 0.5]] })), "mote_picked")).toHaveLength(1);
    expect(events(run(5, scn({ motes: [[0, 1.6, 0.5]] })), "mote_picked")).toHaveLength(0);
  });
  it("jumping reaches a mote 2.5 m up", () => {
    const r = run(40, scn({ motes: [[0, 2.5, 0]] }), press("jump"));
    expect(events(r, "mote_picked")).toHaveLength(1);
    const t = events(r, "mote_picked")[0]!.tick;
    expect(snap(r, t).player.pos[1]).toBeGreaterThanOrEqual(1);
  });
  it("night 3: a mote on tier 1 is not picked from tier 0 below, but is from tier 1", () => {
    const below = run(5, scn({ player: { pos: [18, 0, -0.5] }, motes: [[18, 3, 0.3]], wind_enabled: false }), undefined, 1, 3);
    expect(events(below, "mote_picked")).toHaveLength(0);
    const same = run(5, scn({ player: { pos: [18, 3, 1] }, motes: [[18, 3, 0.3]], wind_enabled: false }), undefined, 1, 3);
    expect(events(same, "mote_picked")).toHaveLength(1);
  });
});

describe("AC26 deposit by min(carried, missing)", () => {
  // Ticket-03 §5: +5 per mote (was +10), so 7 × 5 + 100 = 135 (was 170).
  it("10 carried into a lantern holding 3: deposit 7, keep 3, light, +35 +100", () => {
    const r = run(1, scn({ player: { carried: 10 }, lanterns: [{ id: "L1", pos: [0, 0, 1], deposited: 3 }] }), press("interact"));
    expect(events(r, "deposit")[0]!.data).toEqual({ lantern_id: "L1", amount: 7, deposited: 10 });
    expect(snap(r, 1).player.carried).toBe(3);
    expect(snap(r, 1).score).toBe(135);
  });
});

describe("AC27 mote respawn", () => {
  it("one more mote at tick 240, 480, ...; random_motes:false never spawns", () => {
    const r = runCli(["--seed", "3", "--night", "1", "--ticks", "480", "--snapshot-every", "1"], { scenario: { random_shades: false } });
    expect(snap(r, 239).motes_active).toBe(20);
    expect(snap(r, 240).motes_active).toBe(21);
    expect(snap(r, 480).motes_active).toBe(22);
    expect(snap(run(480, scn({})), 480).motes_active).toBe(0);
  });
  it("night 1 tops out at its 24 spawn points; night 3 at the cap of 30", () => {
    const n1 = runCli(["--seed", "3", "--night", "1", "--ticks", "2400", "--snapshot-every", "2400"], { scenario: { random_shades: false } });
    expect(snap(n1, 2400).motes_active).toBe(24);
    const n3 = runCli(["--seed", "3", "--night", "3", "--ticks", "2880", "--snapshot-every", "240"], {
      scenario: { random_shades: false, random_drifters: false, wind_enabled: false },
    });
    expect(snap(n3, 2400).motes_active).toBe(30);
    expect(snap(n3, 2880).motes_active).toBe(30);
  });
});

describe("AC28 shade spawning schedule", () => {
  // The player sits in a lit lantern's safe zone so the shades never end the run.
  const safe = { random_motes: false, random_drifters: false, wind_enabled: false, lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }] };
  it("night 1: S1, S2 at tick 300, then one every 480 ticks, max 6, spawning for 30 ticks", () => {
    const r = runCli(["--seed", "9", "--night", "1", "--ticks", "3000", "--snapshot-every", "1"], { scenario: safe });
    expect(events(r, "shade_spawned").map((e) => [e.tick, e.data.id])).toEqual([
      [300, "S1"], [300, "S2"], [780, "S3"], [1260, "S4"], [1740, "S5"], [2220, "S6"],
    ]);
    expect(snap(r, 299).shades).toHaveLength(0);
    const s300 = snap(r, 300).shades;
    expect(s300.map((s: any) => s.state)).toEqual(["spawning", "spawning"]);
    for (const s of s300) {
      expect(xz(s.pos, [0, 0, 0])).toBeCloseTo(37, 2);
      expect(s.pos[1]).toBe(1);
    }
    expect(snap(r, 329).shades[0].state).toBe("spawning");
    expect(["wander", "chase"]).toContain(snap(r, 330).shades[0].state);
    expect(snap(r, 3000).shades).toHaveLength(6);
  });
  it("spawn points closer than 15 m to the player are never used", () => {
    // Player stands on the 15° spawn point (37 m): that point and none other is within 15 m.
    const p = [35.739, 0, 9.576];
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runCli(["--seed", String(seed), "--night", "1", "--ticks", "2300", "--snapshot-every", "10"], {
        scenario: { ...safe, player: { pos: p }, lanterns: [{ id: "L1", pos: p, lit: true }] },
      });
      for (const e of events(r, "shade_spawned")) {
        const s = r.lines.find((l) => l.type === "snapshot" && l.tick >= e.tick)!.shades.find((x: any) => x.id === e.data.id);
        expect(xz(s.pos, p)).toBeGreaterThanOrEqual(15);
      }
    }
  });
  it("nights 2 and 3 use their own intervals (420 / 360 ticks)", () => {
    const n2 = runCli(["--seed", "9", "--night", "2", "--ticks", "720"], { scenario: safe });
    expect(events(n2, "shade_spawned").map((e) => e.tick)).toEqual([300, 300, 720]);
    const n3 = runCli(["--seed", "9", "--night", "3", "--ticks", "660"], { scenario: { ...safe, player: { pos: [0, 0, 0] }, lanterns: [{ id: "L4", pos: [0, 0, -30], lit: true }] } });
    expect(events(n3, "shade_spawned").map((e) => e.tick)).toEqual([300, 300, 660]);
  });
});

describe("AC29 chase / wander", () => {
  it("a shade 20 m away wanders (slowly), one within 12 m chases", () => {
    const r = run(60, scn({ shades: [{ id: "S1", pos: [20, 1, 0] }, { id: "S2", pos: [0, 1, 11] }] }), undefined, 60);
    expect(snap(r, 0).shades.map((s: any) => s.state)).toEqual(["wander", "chase"]);
    const s1 = snap(r, 60).shades[0];
    expect(s1.state).toBe("wander");
    expect(xz(s1.pos, [20, 1, 0])).toBeLessThanOrEqual(1.5 + 1e-3);
  });
  it("a chasing shade outrun beyond 18 m goes back to wander", () => {
    const r = run(300, scn({ shades: [{ id: "S1", pos: [-11, 1, 0] }] }), { frames: [{ tick: 0, move: [1, 0] }] }, 10);
    expect(snap(r, 10).shades[0].state).toBe("chase");
    expect(snap(r, 300).shades[0].state).toBe("wander");
    expect(events(r, "player_hit")).toHaveLength(0);
  });
});

describe("AC30 hit consequences", () => {
  const touching = (extra: Record<string, unknown> = {}) =>
    scn({ player: { flames: 3, carried: 4 }, shades: [{ id: "S1", pos: [0.5, 1, 0] }], ...extra });
  it("the hitting shade recoils 2 m over 60 ticks, then acts again", () => {
    const r = run(61, touching());
    // Step 8 (move) runs before step 9 (contacts): on tick 1 the shade first closes in 4/60 m, then hits.
    expect(snap(r, 1).shades[0]).toEqual({ id: "S1", pos: [0.433, 1, 0], state: "recoil" });
    expect(snap(r, 31).shades[0]).toEqual({ id: "S1", pos: [1.433, 1, 0], state: "recoil" });
    expect(snap(r, 61).shades[0]).toEqual({ id: "S1", pos: [2.433, 1, 0], state: "chase" });
    expect(snap(r, 1).player.invuln).toBe(true);
    expect(snap(r, 61).player.invuln).toBe(true);
  });
  it("dropped motes live 480 ticks", () => {
    // After the hit the player walks into a lit lantern's safe zone so the shade cannot hit again.
    const r = run(481, touching({ lanterns: [{ id: "L1", pos: [0, 0, -8], lit: true }] }), {
      frames: [{ tick: 1, move: [0, -1] }, { tick: 80, move: [0, 0] }],
    });
    expect(events(r, "player_hit").map((e) => e.tick)).toEqual([1]);
    expect(snap(r, 1).motes.map((m: any) => m.ttl_s)).toEqual([8, 8]);
    expect(snap(r, 480).motes.map((m: any) => m.ttl_s)).toEqual([0.017, 0.017]);
    expect(snap(r, 481).motes).toEqual([]);
  });
  it("night 3: a shade below a 3 m cliff cannot hit the player on tier 1", () => {
    const r = run(120, scn({ player: { pos: [0, 3, 12.5] }, shades: [{ id: "S1", pos: [0, 1, 11.8] }], wind_enabled: false }), undefined, 1, 3);
    expect(events(r, "player_hit")).toHaveLength(0);
  });
});

describe("AC31 losing beats winning", () => {
  it("no flames left and every lantern lit on the same tick -> lost, no_flames", () => {
    const r = run(5, scn({ player: { flames: 0 }, lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
    expect(events(r, "game_over")).toEqual([{ type: "event", tick: 1, name: "game_over", data: { result: "lost", reason: "no_flames" } }]);
  });
});

describe("AC32 pulse is 3D from feet + 0.8 m", () => {
  it("shade 3 m away horizontally but 4.2 m above the centre is out of range; 4.0 m above is in", () => {
    const out = run(1, scn({ player: { carried: 3 }, shades: [{ id: "S1", pos: [3, 5, 0] }] }), press("pulse"));
    expect(events(out, "pulse")[0]!.data).toEqual({ stunned_ids: [] });
    const inn = run(1, scn({ player: { carried: 3 }, shades: [{ id: "S1", pos: [3, 4.8, 0] }] }), press("pulse"));
    expect(events(inn, "pulse")[0]!.data).toEqual({ stunned_ids: ["S1"] });
  });
  it("a shade exactly 5 m away horizontally at the usual height (centre 1 m) is just out of range", () => {
    expect(events(run(1, scn({ player: { carried: 3 }, shades: [{ id: "S1", pos: [5, 1, 0] }] }), press("pulse")), "pulse")[0]!.data)
      .toEqual({ stunned_ids: [] });
  });
  it("pushback stops at the island edge (obstacle)", () => {
    const r = run(15, scn({ player: { pos: [37, 0, 0], carried: 3 }, shades: [{ id: "S1", pos: [39, 1, 0] }] }), press("pulse"));
    expect(snap(r, 15).shades[0].pos[0]).toBeLessThanOrEqual(40);
    expect(snap(r, 15).shades[0].pos[0]).toBeGreaterThan(39.5);
  });
});

describe("AC33 safe zone of a lantern lit with a shade inside", () => {
  it("the shade is pushed to the 6 m edge within 30 ticks and never hurts meanwhile", () => {
    const r = run(120, scn({ player: { pos: [0, 0, 1], carried: 10 }, shades: [{ id: "S1", pos: [0.5, 1, 1] }], lanterns: [{ id: "L1", pos: [0, 0, 0] }] }), press("interact"));
    expect(events(r, "lantern_lit")[0]!.tick).toBe(1);
    expect(events(r, "player_hit")).toHaveLength(0);
    expect(xz(snap(r, 30).shades[0].pos, [0, 0, 0])).toBeGreaterThan(6);
    for (const s of snaps(r).filter((x) => x.tick >= 30)) expect(xz(s.shades[0].pos, [0, 0, 0])).toBeGreaterThan(6);
  });
});

describe("AC34 dash", () => {
  it("14 m/s for 12 ticks (2.8 m), event dash {}, 90-tick cooldown from the start", () => {
    const r = run(100, scn({}), {
      frames: [
        { tick: 0, move: [0, 1], dash: true }, { tick: 1, move: [0, 0], dash: false },
        { tick: 60, dash: true }, { tick: 61, dash: false }, { tick: 90, dash: true },
      ],
    });
    expect(events(r, "dash").map((e) => [e.tick, e.data])).toEqual([[1, {}], [91, {}]]);
    expect(snap(r, 1).player.dash_cd_s).toBe(1.5);
    expect(snap(r, 1).player.vel).toEqual([0, 0, 14]);
    expect(snap(r, 12).player.pos).toEqual([0, 0, 2.8]);
    expect(snap(r, 30).player.pos).toEqual([0, 0, 2.8]);
  });
  it("standing still dashes where the player faces (last move direction)", () => {
    const r = run(40, scn({}), { frames: [{ tick: 0, move: [-1, 0] }, { tick: 10, move: [0, 0] }, { tick: 20, dash: true }] });
    expect(snap(r, 40).player.pos).toEqual([-1 - 2.8, 0, 0]);
  });
  it("dashing in the air keeps the altitude", () => {
    const r = run(30, scn({}), { frames: [{ tick: 0, jump: true }, { tick: 8, dash: true }] });
    const ys = snaps(r).filter((s) => s.tick >= 9 && s.tick <= 20).map((s) => s.player.pos[1]);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeGreaterThan(0.5);
    expect(snap(r, 21).player.pos[1]).toBeLessThan(ys[0]);
  });
  // Instructor slide CP2 "Lỗi thường gặp": the player is NOT invulnerable while dashing.
  it("dashing through a shade still gets hit (no invulnerability while dashing)", () => {
    const r = run(12, scn({ player: { flames: 3, carried: 2 }, shades: [{ id: "S1", pos: [2, 1, 0] }] }), {
      frames: [{ tick: 0, move: [1, 0], dash: true }],
    });
    const hit = events(r, "player_hit");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.data).toEqual({ by: "shade", flames: 2, dropped: 1 });
    expect(events(r, "dash")[0]!.tick).toBe(1);
    expect(hit[0]!.tick).toBeLessThanOrEqual(12); // still inside the 12-tick dash
    expect(snap(r, hit[0]!.tick - 1).player.invuln).toBe(false);
  });
});

describe("AC35 falling off the island", () => {
  it("player_hit {fall} once, all motes lost, respawn at the start 60 ticks later, invulnerable", () => {
    const r = run(200, scn({ player: { pos: [39, 0, 0], carried: 4 } }), { frames: [{ tick: 0, move: [1, 0] }] });
    const hits = events(r, "player_hit");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data).toEqual({ by: "fall", flames: 2, dropped: 0, lost: 4 });
    const t = hits[0]!.tick;
    expect(snap(r, t).player.pos[1]).toBeLessThan(-10);
    expect(snap(r, t + 59).player.pos[1]).toBeLessThan(-10);
    expect(snap(r, t + 60).player).toMatchObject({ pos: [0, 0, 0], vel: [0, 0, 0], carried: 0, invuln: true, flames: 2 });
  });
  it("falling with the last flame loses immediately", () => {
    const r = run(200, scn({ player: { pos: [39, 0, 0], flames: 1 } }), { frames: [{ tick: 0, move: [1, 0] }] });
    expect(events(r, "game_over")[0]!.data).toEqual({ result: "lost", reason: "no_flames" });
    expect(events(r, "game_over")[0]!.tick).toBe(events(r, "player_hit")[0]!.tick);
  });
  it("falling ignores invulnerability", () => {
    const r = run(200, scn({ player: { pos: [39, 0, 0], invuln_ticks: 600 } }), { frames: [{ tick: 0, move: [1, 0] }] });
    expect(events(r, "player_hit")).toHaveLength(1);
  });
});

describe("AC36 night 2: bridge and bounce pads", () => {
  const n2 = (extra: Record<string, unknown>) => scn({ wind_enabled: false, charms: [], ...extra });
  it("the bamboo bridge carries the player from island A to island B", () => {
    const r = run(240, n2({ player: { pos: [24, 0, 0] } }), { frames: [{ tick: 0, move: [1, 0] }] }, 240, 2);
    expect(snap(r, 240).player.pos).toEqual([48, 0, 0]);
    expect(events(r, "player_hit")).toHaveLength(0);
  });
  it("stepping off the side of the bridge falls", () => {
    const r = run(150, n2({ player: { pos: [35, 0, 0] } }), { frames: [{ tick: 0, move: [0, 1] }] }, 10, 2);
    expect(events(r, "player_hit")[0]!.data.by).toBe("fall");
  });
  it("pad (20,0,18) launches toward island B and lands there", () => {
    const r = run(120, n2({ player: { pos: [20, 0, 18] } }), undefined, 1, 2);
    expect(snap(r, 1).player.vel[1]).toBeGreaterThan(13);
    const landed = snaps(r).find((s) => s.tick > 5 && s.player.grounded)!;
    expect(xz(landed.player.pos, [70, 0, 0])).toBeLessThan(28);
    expect(landed.tick).toBeGreaterThan(80);
    expect(landed.tick).toBeLessThan(90); // ≈ 1.4 s
    expect(events(r, "player_hit")).toHaveLength(0);
  });
  it("movement keys do not override the launch velocity", () => {
    const r = run(40, n2({ player: { pos: [20, 0, 18] } }), { frames: [{ tick: 1, move: [-1, 0] }] }, 1, 2);
    expect(snap(r, 40).player.pos[0]).toBeGreaterThan(30);
  });
  // Instructor slide notes (Ticket-02): the player may still dash during a pad flight.
  it("dashing during a pad flight is allowed; the launch velocity resumes after the 12 dash ticks", () => {
    const base = run(30, n2({ player: { pos: [20, 0, 18] } }), undefined, 1, 2);
    const r = run(30, n2({ player: { pos: [20, 0, 18] } }), { frames: [{ tick: 10, move: [0, -1], dash: true }] }, 1, 2);
    expect(events(r, "dash").map((e) => e.tick)).toEqual([11]);
    expect(snap(r, 11).player.grounded).toBe(false);
    const [vx, , vz] = snap(r, 11).player.vel;
    expect([vx, vz]).toEqual([0, -14]); // horizontal velocity = dash for 0.2 s
    const launch = snap(base, 30).player.vel;
    expect([snap(r, 30).player.vel[0], snap(r, 30).player.vel[2]]).toEqual([launch[0], launch[2]]);
    expect(snap(r, 30).player.grounded).toBe(false);
  });
});

describe("AC37 night 3: tiers, ramps, pad, bell tower", () => {
  const n3 = (extra: Record<string, unknown>) => scn({ wind_enabled: false, charms: [], ...extra });
  it("the tier-1 wall blocks walking up", () => {
    const r = run(60, n3({ player: { pos: [0, 0, 26] } }), { frames: [{ tick: 0, move: [0, -1] }] }, 60, 3);
    expect(snap(r, 60).player.pos[1]).toBe(0);
    expect(snap(r, 60).player.pos[2]).toBeGreaterThanOrEqual(24);
  });
  it("the 30° ramp leads from tier 0 up to tier 1", () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const r = run(120, n3({ player: { pos: [31 * c, 0, 31 * s] } }), { frames: [{ tick: 0, move: [-c, -s] }] }, 60, 3);
    expect(snap(r, 120).player.pos[1]).toBe(3);
    expect(xz(snap(r, 120).player.pos, [0, 0, 0])).toBeCloseTo(19, 1);
  });
  it("pad (0,3,13) lands the player on tier 2 (y 6)", () => {
    const r = run(90, n3({ player: { pos: [0, 3, 13] } }), undefined, 1, 3);
    const landed = snaps(r).find((x) => x.tick > 5 && x.player.grounded)!;
    expect(landed.player.pos[1]).toBe(6);
    expect(xz(landed.player.pos, [0, 0, 0])).toBeLessThanOrEqual(8);
  });
  it("the bell tower (r 2) cannot be walked into", () => {
    const r = run(60, n3({ player: { pos: [0, 6, 6] } }), { frames: [{ tick: 0, move: [0, -1] }] }, 60, 3);
    expect(xz(snap(r, 60).player.pos, [0, 0, 0])).toBeGreaterThanOrEqual(2);
    expect(snap(r, 60).player.pos[1]).toBe(6);
  });
  it("walking off tier 2 drops to tier 0 (no fall event)", () => {
    const r = run(120, n3({ player: { pos: [0, 6, -7] } }), { frames: [{ tick: 0, move: [0, -1] }] }, 120, 3);
    expect(snap(r, 120).player.pos[1]).toBe(0);
    expect(events(r, "player_hit")).toHaveLength(0);
  });
});

describe("AC38 Gió Lạc (drifters)", () => {
  it("chases a player carrying ≥ 5 within 15 m, steals min(3, carried), flees 240 ticks, then is removed", () => {
    const r = run(400, scn({ player: { carried: 5 }, drifters: [{ id: "D1", pos: [10, 1.5, 0] }] }), undefined, 1, 2);
    expect(snap(r, 0).drifters[0].state).toBe("idle");
    expect(snap(r, 1).drifters[0].state).toBe("chase");
    const steal = events(r, "drifter_steal");
    expect(steal).toHaveLength(1);
    expect(steal[0]!.data).toEqual({ drifter_id: "D1", amount: 3, carried: 2 });
    const t = steal[0]!.tick;
    expect(snap(r, t).drifters[0]).toMatchObject({ state: "flee", stolen: 3 });
    expect(snap(r, t + 239).drifters[0].state).toBe("flee");
    expect(snap(r, t + 240).drifters[0]).toMatchObject({ state: "removed", stolen: 3 });
    expect(snap(r, 400).player.carried).toBe(2);
  });
  it("stays idle while the player carries fewer than 5", () => {
    const r = run(30, scn({ player: { carried: 4 }, drifters: [{ id: "D1", pos: [10, 1.5, 0] }] }), undefined, 30, 2);
    expect(snap(r, 30).drifters[0].state).toBe("idle");
  });
  it("ignores invulnerability and safe zones", () => {
    const r = run(200, scn({ player: { carried: 6, invuln_ticks: 600 }, lanterns: [{ id: "L1", pos: [0, 0, 1], lit: true }], drifters: [{ id: "D1", pos: [8, 1.5, 0] }] }), undefined, 10, 2);
    expect(events(r, "drifter_steal")).toHaveLength(1);
  });
  it("pulse on a chasing drifter makes it flee without stealing", () => {
    const r = run(300, scn({ player: { carried: 8 }, drifters: [{ id: "D1", pos: [4, 1.5, 0], state: "chase" }] }), press("pulse"), 10, 2);
    expect(snap(r, 10).drifters[0].state).toBe("flee");
    expect(events(r, "drifter_steal")).toHaveLength(0);
    expect(snap(r, 300).player.carried).toBe(5);
  });
  it("pulse on a fleeing drifter with loot drops it where it is, then it vanishes after 120 ticks", () => {
    const r = run(130, scn({ player: { carried: 3 }, drifters: [{ id: "D1", pos: [3, 1.5, 0], state: "flee", stolen: 3 }] }), press("pulse"), 1, 2);
    expect(events(r, "drifter_drop")).toEqual([{ type: "event", tick: 1, name: "drifter_drop", data: { drifter_id: "D1", amount: 3 } }]);
    const dropped = snap(r, 1).motes.filter((m: any) => m.kind === "dropped");
    expect(dropped).toHaveLength(3);
    for (const m of dropped) expect(m.pos).toEqual([3, 0, 0]);
    expect(snap(r, 1).drifters[0]).toMatchObject({ state: "flee", stolen: 0 });
    expect(snap(r, 119).drifters[0].state).toBe("flee");
    expect(snap(r, 120).drifters[0].state).toBe("removed");
  });
  it("default nights 2/3 spawn a drifter at tick 1200; night 1 never does", () => {
    const opts = { random_shades: false, random_motes: false, wind_enabled: false };
    const n2 = runCli(["--seed", "4", "--night", "2", "--ticks", "1200", "--snapshot-every", "1"], { scenario: opts });
    expect(snap(n2, 1199).drifters).toHaveLength(0);
    expect(snap(n2, 1200).drifters).toEqual([expect.objectContaining({ id: "D1", state: "idle", stolen: 0 })]);
    const n1 = runCli(["--seed", "4", "--night", "1", "--ticks", "1200", "--snapshot-every", "1200"], { scenario: opts });
    expect(snap(n1, 1200).drifters).toHaveLength(0);
  });
});

describe("AC39 Bùa Gió (charm)", () => {
  it("picked like a mote: charm_picked {C1, 600}, runs 7.2 m/s, back after 2700 ticks", () => {
    const r = run(2701, scn({ player: { pos: [35, 0, 0] } }), { frames: [{ tick: 0, move: [1, 0] }, { tick: 61, move: [0, 0] }, { tick: 2600, move: [-1, 0] }, { tick: 2655, move: [0, 0] }] }, 1, 2);
    const picks = events(r, "charm_picked");
    expect(picks[0]).toEqual({ type: "event", tick: 1, name: "charm_picked", data: { charm_id: "C1", charm_ticks: 600 } });
    expect(snap(r, 1).player.charm_s).toBe(10);
    expect(snap(r, 1).charms[0]).toEqual({ id: "C1", available: false, respawn_s: 45 });
    // tick 1 at 6 m/s, ticks 2..61 at 7.2 m/s
    expect(snap(r, 61).player.pos[0]).toBeCloseTo(35 + 0.1 + 60 * 0.12, 3);
    expect(snap(r, 2700).charms[0].available).toBe(false);
    expect(snap(r, 2701).charms[0].available || picks.some((p) => p.tick === 2701)).toBe(true);
  });
  it("while active, dash has no cooldown (pressing during a dash is ignored)", () => {
    const r = run(60, scn({ player: { charm_ticks: 600 } }), {
      frames: [{ tick: 0, move: [0, 1], dash: true }, { tick: 1, dash: false }, { tick: 5, dash: true }, { tick: 6, dash: false }, { tick: 20, dash: true }, { tick: 21, dash: false }],
    });
    expect(events(r, "dash").map((e) => e.tick)).toEqual([1, 21]);
    expect(snap(r, 1).player.dash_cd_s).toBe(0);
  });
  it("re-picking refreshes the 600 ticks", () => {
    const r = run(2, scn({ player: { charm_ticks: 100 }, charms: [{ id: "C1", pos: [0, 0, 0.5] }] }), undefined, 1);
    expect(snap(r, 1).player.charm_s).toBe(10);
  });
});

describe("AC40 strong wind (night 3)", () => {
  it("gust at sim ticks 1800–2099 pushes a standing player 2 m/s (10 m total)", () => {
    const sc = { random_shades: false, random_drifters: false, random_motes: false };
    const r = runCli(["--seed", "6", "--night", "3", "--ticks", "2100", "--snapshot-every", "1"], { scenario: sc });
    expect(snap(r, 1799).wind.active).toBe(false);
    expect(snap(r, 1799).player.pos).toEqual([0, 0, -30]);
    expect(snap(r, 1800).wind.active).toBe(true);
    expect(snap(r, 2099).wind.active).toBe(true);
    expect(snap(r, 2100).wind.active).toBe(false);
    const dir = snap(r, 1800).wind.dir_deg;
    const p = snap(r, 2100).player.pos;
    const a = (dir * Math.PI) / 180;
    expect(near(p, [10 * Math.cos(a), 0, -30 + 10 * Math.sin(a)], 0.01)).toBe(true);
    const calm = runCli(["--seed", "6", "--night", "3", "--ticks", "2100", "--snapshot-every", "2100"], { scenario: { ...sc, wind_enabled: false } });
    expect(snap(calm, 2100).player.pos).toEqual([0, 0, -30]);
  });
  it("nights 1 and 2 have no wind", () => {
    const r = runCli(["--seed", "6", "--night", "2", "--ticks", "1900", "--snapshot-every", "1900"], { scenario: { random_shades: false } });
    expect(snap(r, 1900).wind.active).toBe(false);
  });
});

describe("AC41 pause", () => {
  const frames = [
    { tick: 0, move: [0, 1] },
    { tick: 10, pause: true }, { tick: 11, pause: false },
    { tick: 15, interact: true, pulse: true, dash: true, jump: true },
    { tick: 20, pause: true, interact: false, pulse: false, dash: false, jump: false }, { tick: 21, pause: false },
  ];
  const r = run(30, scn({ player: { carried: 5 }, lanterns: [{ id: "L1", pos: [0, 0, 1.5] }] }), { frames });
  it("paused {} / resumed {} events; tick advances, sim_tick and gameplay freeze", () => {
    expect(events(r, "paused").map((e) => [e.tick, e.data])).toEqual([[11, {}]]);
    expect(events(r, "resumed").map((e) => [e.tick, e.data])).toEqual([[21, {}]]);
    const p = snap(r, 15);
    // Ticket-03: night 1 now lasts 240 s (was 300 s).
    expect(p).toMatchObject({ tick: 15, sim_tick: 10, state: "paused", time_left_s: 239.833 });
    expect(p.player.pos).toEqual([0, 0, 1]);
    expect(snap(r, 20).player.pos).toEqual([0, 0, 1]);
    expect(snap(r, 21)).toMatchObject({ sim_tick: 11, state: "playing" });
    expect(snap(r, 21).player.pos).toEqual([0, 0, 1.1]);
    for (const n of ["deposit", "pulse", "dash"]) expect(events(r, n), n).toHaveLength(0);
  });
  it("end line while paused says paused", () => {
    const p = run(20, scn({}), { frames: [{ tick: 5, pause: true }] });
    expect(p.lines.at(-1)).toEqual({ type: "end", ticks: 20, state: "paused", score: 0 });
  });
});

describe("AC43 performance and determinism over full nights", () => {
  it("a 21 600-tick night runs headless in well under 30 s", () => {
    const t0 = Date.now();
    // Ticket-03: L4 now runs out of fuel (70 s to lose its safe zone), so the idle player is hit and used to lose
    // at tick 4872. The run must still last 21 600 ticks with every shade spawned: give the player enough flames.
    const r = runCli(["--seed", "1", "--night", "3", "--ticks", "21600"], {
      scenario: { time_left_s: 400, wind_enabled: false, player: { pos: [0, 0, -30], flames: 1000 }, lanterns: [{ id: "L4", pos: [0, 0, -30], lit: true }] },
    });
    const ms = Date.now() - t0;
    expect(r.code).toBe(0);
    expect(r.lines.at(-1)).toMatchObject({ ticks: 21600 });
    expect(ms).toBeLessThan(30000);
  });
  for (const night of [2, 3]) {
    it(`night ${night}: same seed + inputs -> byte-identical output (drifters, charms, wind active)`, () => {
      const frames = [];
      for (let t = 0; t < 3000; t += 90) frames.push({ tick: t, move: [Math.sin(t / 200), Math.cos(t / 200)], pulse: t % 180 === 0, dash: t % 270 === 0 });
      const args = ["--seed", "77", "--night", String(night), "--ticks", "3000"];
      const sc = { player: { carried: 10 } };
      const a = runCli(args, { inputs: { frames }, scenario: sc });
      const b = runCli(args, { inputs: { frames }, scenario: sc });
      expect(a.code).toBe(0);
      expect(a.raw).toBe(b.raw);
    });
  }
});
