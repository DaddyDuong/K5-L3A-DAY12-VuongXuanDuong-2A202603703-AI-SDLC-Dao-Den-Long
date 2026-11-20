// Ticket-04 acceptance criteria AC62–AC72 (docs/notes/phase-4-assumptions.md §4).
// Bench scene: through the same snapshot() serializer as the headless JSONL. Soak + export: the real built commands.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkEntry, insertEntry, normalizeName, sortEntries, type LeaderboardEntry } from "../src/app/leaderboard.js";
import { BENCH, benchCamera, createBenchWorld, frameStats, SoakInput } from "../src/sim/bench.js";
import { snapshot } from "../src/sim/snapshot.js";
import { step } from "../src/sim/step.js";
import { DEFAULT_INPUT } from "../src/sim/types.js";
import { runCli, snap } from "./helpers.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ddl4-"));

describe("AC62 bench scene: 200 wandering shades, 100 motes, L1–L3 lit at fuel 100, Mây at (0,0,0)", () => {
  const s = snapshot(createBenchWorld(42));

  it("has exactly the standard entities", () => {
    expect(s.night).toBe(1);
    expect(s.shades).toHaveLength(200);
    expect(new Set(s.shades.map((x) => x.state))).toEqual(new Set(["wander"]));
    expect(s.motes).toHaveLength(100);
    expect(s.player.pos).toEqual([0, 0, 0]);
    expect(s.lanterns.map((l) => [l.id, l.lit, l.fuel])).toEqual([
      ["L1", true, 100], ["L2", true, 100], ["L3", true, 100], ["L4", false, 0], ["L5", false, 0],
    ]);
    expect(s.drifters).toEqual([]);
  });

  it("spreads them over the island (all within 38 m, every quadrant used) and is deterministic per seed", () => {
    const r = (p: number[]) => Math.hypot(p[0]!, p[2]!);
    expect(Math.max(...s.shades.map((x) => r(x.pos)), ...s.motes.map((m) => r(m.pos)))).toBeLessThanOrEqual(38);
    const quads = new Set(s.shades.map((x) => `${Math.sign(x.pos[0])}${Math.sign(x.pos[2])}`));
    expect(quads.size).toBe(4);
    expect(snapshot(createBenchWorld(42))).toEqual(s);
    expect(snapshot(createBenchWorld(43)).shades[0]!.pos).not.toEqual(s.shades[0]!.pos);
  });
});

describe("AC63 bench scene runs: no spawning, damage, pickup, fuel burn or end; shades keep wandering", () => {
  const w = createBenchWorld(42);
  const start = snapshot(w);
  const allEvents: string[] = [];
  for (let k = 0; k < 30 * 60; k++) allEvents.push(...step(w, DEFAULT_INPUT).map((e) => e.name));
  const end = snapshot(w);

  it("30 s later the counts, fuel, flames and state are unchanged", () => {
    expect(allEvents.filter((n) => n !== "night_start")).toEqual([]);
    expect(end.shades).toHaveLength(200);
    expect(end.motes).toHaveLength(100);
    expect(end.lanterns.map((l) => l.fuel)).toEqual([100, 100, 100, 0, 0]);
    expect(end.player).toMatchObject({ flames: 3, carried: 0, pos: [0, 0, 0] });
    expect(end.state).toBe("playing");
  });

  it("shades still move by the wander rule (toward the nearest unlit lantern) and never chase", () => {
    expect(new Set(end.shades.map((x) => x.state))).toEqual(new Set(["wander"]));
    const moved = end.shades.filter((x, i) => Math.hypot(x.pos[0] - start.shades[i]!.pos[0], x.pos[2] - start.shades[i]!.pos[2]) > 1);
    expect(moved.length).toBeGreaterThan(150);
  });

  it("keeps going past the night's duration without a game_over", () => {
    const w2 = createBenchWorld(42);
    for (let k = 0; k < 240 * 60 + 60; k++) expect(step(w2, DEFAULT_INPUT).some((e) => e.name === "game_over")).toBe(false);
    expect(w2.state).toBe("playing");
  });

  it("camera orbit: (30,15,0) at t=0, (0,15,30) a quarter turn later, back after 15 s", () => {
    const c = (t: number) => benchCamera(t).map((v) => Math.round(v * 1000) / 1000 || 0); // −0 → 0
    expect(c(0)).toEqual([30, 15, 0]);
    expect(c(3.75)).toEqual([0, 15, 30]);
    expect(c(15)).toEqual([30, 15, 0]);
    expect(BENCH.warmupMs).toBe(3000);
  });
});

describe("AC64 bench numbers follow the Ticket-04 definitions", () => {
  it("avg_fps = 1000N/Σdt, p1_low = 1000/mean of the ceil(1%) largest dt, p95 of dt", () => {
    // 198 frames of 10 ms + 2 frames of 50 ms: N = 200, Σ = 2080, k = 2 → mean 50 ms.
    const dt = [...Array(198).fill(10), 50, 50];
    expect(frameStats(dt)).toEqual({ frames: 200, avg_fps: 96.2, p1_low_fps: 20, frame_ms_p95: 10 });
  });

  it("k is at least 1 and p95 picks the nearest rank", () => {
    const dt = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20 ms
    // k = max(1, ceil(0.2)) = 1 → worst 20 ms; p95 = 19th value = 19.
    expect(frameStats(dt)).toMatchObject({ frames: 20, p1_low_fps: 50, frame_ms_p95: 19 });
  });
});

const soak = (args: string[]) => {
  const out = join(tmp(), "soak.json");
  const r = spawnSync("node", ["--expose-gc", "dist-headless/headless/soak.js", ...args, "--out", out], { encoding: "utf8" });
  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    /* none */
  }
  return { code: r.status, json, stderr: r.stderr };
};

describe("AC66/AC68 soak command", () => {
  it("writes exactly the 6 fields, one result per night, no crash; same seed → same results", () => {
    const a = soak(["--seed", "7", "--nights", "3"]);
    expect(a.code).toBe(0);
    expect(Object.keys(a.json!)).toEqual(["nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"]);
    expect(a.json).toMatchObject({ nights: 3, crashes: 0 });
    expect(a.json!.results).toHaveLength(3);
    for (const r of a.json!.results) expect(["won", "lost"]).toContain(r);
    expect(a.json!.mem_start_mb).toBeGreaterThan(0);
    expect(soak(["--seed", "7", "--nights", "3"]).json!.results).toEqual(a.json!.results);
  });

  it("bad arguments exit 1", () => {
    expect(soak(["--seed", "x", "--nights", "3"]).code).toBe(1);
    expect(soak(["--seed", "7", "--nights", "0"]).code).toBe(1);
  });

  it("random input: new direction every 30 ticks, about 5/3/2/10 % presses", () => {
    const inp = new SoakInput(7);
    const frames = Array.from({ length: 30000 }, (_, k) => inp.at(k));
    expect(frames[29]!.move).toEqual(frames[0]!.move);
    expect(frames[30]!.move).not.toEqual(frames[0]!.move);
    const rate = (b: "jump" | "dash" | "pulse" | "interact") => frames.filter((f) => f[b]).length / frames.length;
    expect(rate("jump")).toBeCloseTo(0.05, 2);
    expect(rate("dash")).toBeCloseTo(0.03, 2);
    expect(rate("pulse")).toBeCloseTo(0.02, 2);
    expect(rate("interact")).toBeCloseTo(0.1, 2);
    expect(frames.some((f) => f.pause)).toBe(false);
  });

  it("the bench/soak code does not change headless output (Phase 3 run still ends the same)", () => {
    const r = runCli(["--seed", "7", "--night", "1", "--ticks", "600"]);
    expect(r.code).toBe(0);
    expect(snap(r, 0).shades).toEqual([]);
    expect(r.lines.at(-1)!.type).toBe("end");
  });
});

const E = (name: string, score: number, at: string, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  name, score, nights_won: 1, achieved_at: at, seed: 7, ...extra,
});

describe("AC69 leaderboard rules", () => {
  it("names: 3–12 of [A-Za-z0-9_], Vietnamese letters accepted, spaces and symbols rejected", () => {
    for (const ok of ["Mây", "abc", "A_1", "x".repeat(12), "Đức_99", "NguyễnVănA"]) expect(normalizeName(ok)).not.toBeNull();
    for (const bad of ["ab", "x".repeat(13), "a b", "a-b", "abc!", "", 42]) expect(normalizeName(bad)).toBeNull();
    // NFD input is normalised to NFC (Mây = 3 characters).
    expect(normalizeName("Ma\u0302\u0300y".normalize("NFD"))).toBe("Mầy".normalize("NFC"));
  });

  it("sorted by score descending; equal score → earlier achieved_at first; keeps the top 10", () => {
    let list: LeaderboardEntry[] = [];
    for (let i = 0; i < 12; i++) list = insertEntry(list, E(`p${i}__`, i * 100, `2026-11-20T20:${String(10 + i).padStart(2, "0")}:00+07:00`));
    expect(list).toHaveLength(10);
    expect(list.map((e) => e.score)).toEqual([1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200]);
    const tie = sortEntries([E("late", 500, "2026-11-20T21:00:00+07:00"), E("early", 500, "2026-11-20T13:59:00Z")]);
    expect(tie.map((e) => e.name)).toEqual(["early", "late"]); // 13:59Z = 20:59+07:00, earlier than 21:00+07:00
  });

  it("entries need an ISO 8601 time with a timezone and nights_won 0–3", () => {
    expect(checkEntry(E("abc", 1, "2026-11-20T21:00:00"))).toBeTypeOf("string");
    expect(checkEntry(E("abc", 1, "2026-11-20T21:00:00+07:00", { nights_won: 4 }))).toBeTypeOf("string");
    expect(checkEntry(E("abc", 1, "2026-11-20T21:00:00+07:00"))).toMatchObject({ name: "abc" });
  });
});

describe("AC70 run_cmd --export-leaderboard", () => {
  const contract = JSON.parse(readFileSync("game.contract.json", "utf8"));
  const [bin, ...pre] = contract.run_cmd.split(" ");
  const run = (dir: string, args: string[]) => spawnSync(bin, [...pre, ...args], { encoding: "utf8", env: { ...process.env, DDL_DATA_DIR: dir } });

  it("an empty board exports {\"entries\": []}", () => {
    const dir = tmp();
    const out = join(dir, "out.json");
    expect(run(dir, ["--export-leaderboard", out]).status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ entries: [] });
  });

  it("exports the stored board top 10 in order with exactly the 5 fields, dropping invalid rows", () => {
    const dir = tmp();
    const rows = [
      E("bob", 300, "2026-11-20T21:00:00+07:00"),
      E("ann", 900, "2026-11-20T21:05:00+07:00", { nights_won: 3, seed: 11 }),
      E("cid", 300, "2026-11-20T20:00:00+07:00"),
      { name: "x y", score: 5, nights_won: 0, achieved_at: "2026-11-20T21:00:00+07:00", seed: 1 },
    ];
    writeFileSync(join(dir, "leaderboard.json"), JSON.stringify({ entries: rows }));
    const out = join(dir, "out.json");
    expect(run(dir, ["--export-leaderboard", out]).status).toBe(0);
    const j = JSON.parse(readFileSync(out, "utf8"));
    expect(j.entries.map((e: LeaderboardEntry) => e.name)).toEqual(["ann", "cid", "bob"]);
    expect(Object.keys(j.entries[0])).toEqual(["name", "score", "nights_won", "achieved_at", "seed"]);
  });

  it("the server saves through POST /api/leaderboard to the file on disk (still there for the next export)", async () => {
    const dir = tmp();
    process.env.DDL_DATA_DIR = dir;
    const { leaderboardApi, startServer } = await import("../src/app/server.js");
    const { server, url } = await startServer({ "/api/leaderboard": leaderboardApi }, 4290);
    try {
      const post = (body: unknown) =>
        fetch(`${url}api/leaderboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      expect((await post({ name: "a b", score: 1, nights_won: 0, seed: 1 })).status).toBe(400);
      const ok = await (await post({ name: "Mây_1", score: 1234, nights_won: 3, seed: 7 })).json();
      expect(ok.entry).toMatchObject({ name: "Mây_1", score: 1234, nights_won: 3, seed: 7 });
      expect(ok.entry.achieved_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    } finally {
      server.close();
      delete process.env.DDL_DATA_DIR;
    }
    const out = join(dir, "out.json");
    expect(run(dir, ["--export-leaderboard", out]).status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).entries.map((e: LeaderboardEntry) => e.name)).toEqual(["Mây_1"]);
  });

  it("bad arguments exit 1", () => {
    expect(run(tmp(), ["--export-leaderboard"]).status).toBe(1);
    expect(run(tmp(), ["--bogus"]).status).toBe(1);
  });
});
