# Đảo Đèn Lồng — agent guide

3D third-person game (TS + Three.js + Vite), 3 nights. Graded by hidden tests through the **headless mode** of Test
Contract **v1.3** (Ticket-02…04, `docs/notes/ticket-0N.md`). Correct > pretty. Win only at dawn (≥ 60% lit).

## Requirement sources (read the new phase's tab before planning)
- Lab board (one tab per phase): https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW — cross-origin iframe: read it with
  Claude in Chrome screenshots, copy the ticket to `docs/notes/ticket-0N.md`.
- Instructor slides (grading, DoD): https://blgihuy.github.io/k5-day12-instructor-slides/ → `docs/notes/instructor-guide.md`.

## Commands
- Install/build: `npm ci && npm run build`
- Tests: `npm test` (builds headless first; must be green before you finish, Stop hook enforces) · `npm run typecheck`
- Headless: `npm run headless -- --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--inputs f.json] [--scenario f.json]`
- Play: `npm run dev` or `npm start` (= `run_cmd`, serves dist-web + leaderboard API). `?night=N`, `?fps=1`, `?bench=42`.
- Ticket-04: `npm run bench` (opens installed Chrome, writes bench.json), `npm run soak`, `npm run package` (release
  zip); `scripts/proof-phase4.sh` regenerates bench.json, soak.json and `docs/proof/phase-4/*.txt`.
- Bot win + replay evidence: skill `play-and-capture` (seed 7 for all nights; `?seed=a,b,c` = one seed per night)

## Layout
- `src/sim/` pure game logic, shared by web + headless. `step(world, input)` = exactly one 1/60 s tick, in the
  mandatory 12-step order of Ticket-02 (comments in `step.ts` number the steps).
- `src/sim/maps.ts` 3 standard maps; `tuning.ts` `TUNING` (= contract `tuning`) + `WORLD`; `bench.ts` bench scene.
- `src/headless/cli.ts` contract CLI (exit 0 ok, 1 usage/IO, 2 malformed inputs/scenario); `soak.ts` soak_cmd.
- `src/app/` Node, no deps: `run.ts` run_cmd, `server.ts` + `leaderboard.ts` (on-disk top 10), `bench.ts` bench_cmd.
- `src/web/` rendering, screens, HUD, audio, settings only: `main.ts` (flow + loop + bench scene), `world3d.ts`,
  `hud.ts` (captions, edge arrows), `keys.ts` (remapping), `scores.ts`, `settings.ts`, `audio.ts`, `palette.ts`.
- `src/tools/autoplay.ts` bot (grid Dijkstra + pad flights) used for winnability tests and replays in `public/replays/`.
- `tests/` vitest; `tests/helpers.ts` (`runCli`, `run`, `scn`, `events`, `snap`) runs the built CLI end-to-end.
  `phase4` = AC62–AC72, `phase3` = AC47–AC57, `phase2` = AC23–AC43, `rules`/`headless` = Phase 1 regression.
- `docs/notes/` assumptions per phase (+ AC tables), AI log, retro, `instructor-guide.md` (grading + DoD checklists).
  `docs/proof/` evidence (`scripts/proof-headless.sh`, `proof-phase4.sh`). `docs/lab/` handout (read-only).

## Rules
- `src/sim` must not import `three`, DOM APIs, `Math.random` or `Date`. Randomness only via `Rng` seeded from `--seed`.
- Gameplay numbers live in `src/sim/tuning.ts`; `game.contract.json` `tuning` must match `TUNING` exactly (test enforces).
  Per-night numbers without a contract key (e.g. night 3 shade speed 4.5) live in `maps.ts`.
- Output: only contract fields; coords rounded to 3 decimals via `round3`; events tagged `tick = k+1`; `end` line always last.
- Pause: contract `pause` toggles in the sim (tick advances, sim_tick freezes). Extra creative entities: off in headless
  and in the bench scene, never in contract output.
- Every new rule gets a headless test asserting the JSONL (not just a unit test).
- Never edit test expectations just to make them pass; if a requirement changed, note why (`phase-N-assumptions.md` §1).
- Do not invent requirements: quote the ticket text in `docs/notes/phase-N-assumptions.md` when deciding ambiguities.
- After changing rules: re-run `npm run autoplay` per night; a night the bot can't win = winnability broke, investigate
  before touching the bot (unless the goal changed, as in Ticket-03). Regenerate `public/replays/`.
- Before writing expected values, trace them through the 12-step order (e.g. shades move before contacts; a dash
  replaces horizontal velocity). A new test that fails: decide from the ticket whether the test or the sim is wrong.
- Timing/benchmark claims must check the run reached the stated ticks (`end.ticks`); a lost night ends early.
- bench/soak numbers follow the ticket's definition exactly; never warm up or tweak to pass a threshold — report + explain.
