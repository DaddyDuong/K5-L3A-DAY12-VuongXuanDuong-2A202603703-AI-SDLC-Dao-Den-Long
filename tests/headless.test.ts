// Output format and tick model (contract v1.0 §B–§E, extended by v1.1). AC23, AC24, AC42, AC44.
import { describe, expect, it } from "vitest";
import { TUNING } from "../src/sim/tuning.js";
import { events, runCli, snap, snaps } from "./helpers.js";

const BASE = ["--seed", "42", "--night", "1"];

describe("headless output shape (contract §B, §E + v1.1)", () => {
  const r = runCli([...BASE, "--ticks", "25"]);

  it("exits 0", () => expect(r.code).toBe(0));

  it("first line is snapshot tick 0 with full initial state (AC24)", () => {
    const s = r.lines[0]!;
    expect(s).toMatchObject({ type: "snapshot", tick: 0, sim_tick: 0, night: 1, state: "playing", score: 0 });
    expect(s.time_left_s).toBe(TUNING.night1_duration_s);
    expect(s.wind).toEqual({ active: false, dir_deg: 0 });
    expect(s.player).toEqual({
      pos: [0, 0, 0], vel: [0, 0, 0], grounded: true, flames: TUNING.flames, carried: 0,
      invuln: false, dash_cd_s: 0, pulse_cd_s: 0, charm_s: 0,
    });
    expect(s.lanterns.map((l: any) => l.id)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    expect(s.motes_active).toBe(s.motes.length);
    for (const m of s.motes) expect(Object.keys(m).sort()).toEqual(["id", "kind", "pos", "ttl_s"]);
    expect(s.drifters).toEqual([]);
    expect(s.charms).toEqual([]);
  });

  it("snapshots every 10 ticks by default", () => {
    expect(snaps(r).map((l) => l.tick)).toEqual([0, 10, 20]);
  });

  it("last line is end with ticks = steps run", () => {
    expect(r.lines.at(-1)).toEqual({ type: "end", ticks: 25, state: "playing", score: 0 });
  });

  it("--snapshot-every is honoured", () => {
    const r2 = runCli([...BASE, "--ticks", "6", "--snapshot-every", "3"]);
    expect(snaps(r2).map((l) => l.tick)).toEqual([0, 3, 6]);
  });

  it("AC42: night_start {night} is the first event, at tick 1", () => {
    const first = r.lines.find((l) => l.type === "event");
    expect(first).toEqual({ type: "event", tick: 1, name: "night_start", data: { night: 1 } });
    expect(events(runCli(["--seed", "1", "--night", "3", "--ticks", "1"]), "night_start")[0]!.data).toEqual({ night: 3 });
  });
});

describe("tick model", () => {
  it("move [0,1] for 60 ticks moves player_speed metres along +Z", () => {
    const r = runCli([...BASE, "--ticks", "60", "--snapshot-every", "60"], {
      inputs: { frames: [{ tick: 0, move: [0, 1] }] },
    });
    expect(snap(r, 60).player.pos).toEqual([0, 0, TUNING.player_speed]);
    expect(snap(r, 60).player.vel).toEqual([0, 0, TUNING.player_speed]);
  });

  it("input at tick k affects state k+1, not state k", () => {
    const r = runCli([...BASE, "--ticks", "2", "--snapshot-every", "1"], {
      inputs: { frames: [{ tick: 1, move: [1, 0] }] },
    });
    const xs = snaps(r).map((l) => l.player.pos[0]);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBe(0);
    expect(xs[2]).toBeGreaterThan(0);
  });

  it("time running out ends the game at dawn, event tagged with k+1", () => {
    const r = runCli([...BASE, "--ticks", "1000"], { scenario: { time_left_s: 1 } });
    expect(r.lines).toContainEqual({ type: "event", tick: 60, name: "game_over", data: { result: "lost", reason: "dawn" } });
    expect(r.lines.at(-1)).toMatchObject({ type: "end", ticks: 60, state: "lost" });
  });
});

describe("scenario setup", () => {
  it("applies player, motes, shades, lanterns without events or score", () => {
    const r = runCli([...BASE, "--ticks", "0"], {
      scenario: {
        player: { pos: [1, 0, 2], carried: 3, flames: 2 },
        random_motes: false,
        random_shades: false,
        motes: [[0, 0, 5]],
        shades: [{ id: "S9", pos: [10, 0, 0] }],
        lanterns: [{ id: "L1", pos: [0, 0, 20], lit: true }],
      },
    });
    expect(r.lines).toHaveLength(2);
    const s = r.lines[0]!;
    expect(s.player).toMatchObject({ pos: [1, 0, 2], flames: 2, carried: 3 });
    expect(s.motes).toEqual([{ id: "M1", pos: [0, 0, 5], kind: "random", ttl_s: null }]);
    expect(s.shades[0]).toMatchObject({ id: "S9", pos: [10, 0, 0] });
    expect(s.lanterns[0]).toMatchObject({ id: "L1", pos: [0, 0, 20], lit: true });
    expect(s.score).toBe(0);
  });

  it("v1.1 player timers, shade state, drifters and charms are applied", () => {
    const r = runCli([...BASE, "--ticks", "0"], {
      scenario: {
        player: { invuln_ticks: 30, dash_cd_ticks: 45, pulse_cd_ticks: 90, charm_ticks: 120 },
        random_shades: false,
        shades: [{ id: "S1", pos: [8, 1, 0], state: "stunned", state_ticks_left: 60 }],
        drifters: [{ id: "D1", pos: [5, 1.5, 5], state: "flee", stolen: 2 }],
        charms: [{ id: "C1", pos: [3, 0, 0] }, { id: "C2", pos: [-3, 0, 0], available: false, respawn_ticks: 600 }],
      },
    });
    const s = r.lines[0]!;
    expect(s.player).toMatchObject({ invuln: true, dash_cd_s: 0.75, pulse_cd_s: 1.5, charm_s: 2 });
    expect(s.shades).toEqual([{ id: "S1", pos: [8, 1, 0], state: "stunned" }]);
    expect(s.drifters).toEqual([{ id: "D1", pos: [5, 1.5, 5], state: "flee", stolen: 2 }]);
    expect(s.charms).toEqual([{ id: "C1", available: true, respawn_s: 0 }, { id: "C2", available: false, respawn_s: 10 }]);
  });
});

describe("determinism", () => {
  it("same seed + inputs gives byte-identical output", () => {
    const files = { inputs: { frames: [{ tick: 0, move: [0.3, 1], cam_yaw_deg: 17 }, { tick: 40, jump: true }] } };
    const a = runCli([...BASE, "--ticks", "300"], files);
    const b = runCli([...BASE, "--ticks", "300"], files);
    expect(a.raw.length).toBeGreaterThan(0);
    expect(a.raw).toBe(b.raw);
  });

  it("different seeds give different mote layouts (20 of the fixed spawn points)", () => {
    const a = runCli(["--seed", "1", "--night", "1", "--ticks", "0"]);
    const b = runCli(["--seed", "2", "--night", "1", "--ticks", "0"]);
    expect(a.lines[0]!.motes).toHaveLength(20);
    expect(a.lines[0]!.motes).not.toEqual(b.lines[0]!.motes);
  });
});

describe("error handling", () => {
  it("malformed inputs JSON -> exit 2", () => {
    const r = runCli([...BASE, "--ticks", "10"], { inputs: "{ not json" });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/inputs/);
  });
  it("non-increasing input ticks -> exit 2", () => {
    expect(runCli([...BASE, "--ticks", "10"], { inputs: { frames: [{ tick: 3 }, { tick: 3 }] } }).code).toBe(2);
  });
  it("malformed scenario -> exit 2 (lantern id not on this night, bad shade state, non-boolean pause)", () => {
    expect(runCli([...BASE, "--ticks", "10"], { scenario: { lanterns: [{ id: "L6" }] } }).code).toBe(2);
    expect(runCli(["--seed", "1", "--night", "2", "--ticks", "1"], { scenario: { lanterns: [{ id: "L6", lit: true }] } }).code).toBe(0);
    expect(runCli([...BASE, "--ticks", "10"], { scenario: { shades: [{ pos: [1, 1, 1], state: "angry" }] } }).code).toBe(2);
    expect(runCli([...BASE, "--ticks", "10"], { inputs: { frames: [{ tick: 0, pause: 1 }] } }).code).toBe(2);
  });
  it("missing required argument -> non-zero, not 2", () => {
    const r = runCli(["--night", "1", "--ticks", "10"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--seed/);
  });
  it("AC23: --night accepts 1, 2, 3 only", () => {
    for (const n of ["1", "2", "3"]) expect(runCli(["--seed", "1", "--night", n, "--ticks", "1"]).code).toBe(0);
    expect(runCli(["--seed", "1", "--night", "4", "--ticks", "1"]).code).toBe(1);
    expect(runCli(["--seed", "1", "--night", "0", "--ticks", "1"]).code).toBe(1);
  });
});
