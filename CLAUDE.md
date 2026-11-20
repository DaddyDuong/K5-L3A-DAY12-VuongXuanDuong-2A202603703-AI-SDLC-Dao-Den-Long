# Đảo Đèn Lồng — agent guide

3D third-person game (TS + Three.js + Vite), 3 nights. Graded by hidden tests through the **headless mode** of Test
Contract **v1.2** (Ticket-02 + Ticket-03, `docs/notes/ticket-0N.md`). Correct > pretty. Win only at dawn (≥ 60% lit).

## Requirement sources (read the new phase's tab before planning)
- Lab board (tickets, one tab per phase): https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW — cross-origin iframe, text
  tools return nothing: read it with Claude in Chrome screenshots, then copy the ticket to `docs/notes/ticket-0N.md`.
- Instructor slides (grading, DoD): https://blgihuy.github.io/k5-day12-instructor-slides/ → `docs/notes/instructor-guide.md`.

## Commands
- Install/build: `npm ci && npm run build`
- Tests (builds headless first): `npm test`  ← must be green before you finish (Stop hook enforces it)
- Typecheck (sim + web + tests): `npm run typecheck`
- Headless: `npm run headless -- --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--inputs f.json] [--scenario f.json]`
- Play: `npm run dev` (or `npm start` after build). `?night=N` jumps to a night, `?fps=1` shows FPS + `__bench(n)`.
- Bot win + replay evidence: skill `play-and-capture` (seed 7 for all nights; `?seed=a,b,c` = one seed per night)

## Layout
- `src/sim/` pure game logic, shared by web + headless. `step(world, input)` = exactly one 1/60 s tick, in the
  mandatory 12-step order of Ticket-02 (comments in `step.ts` number the steps).
- `src/sim/maps.ts` the three standard maps (`groundAt` heightfield, lanterns, spawn points, pads, charms, wind).
- `src/sim/tuning.ts` `TUNING` (= contract `tuning`) and `WORLD` (internal constants, in ticks).
- `src/headless/cli.ts` contract CLI (exit 0 ok, 1 usage/IO, 2 malformed inputs/scenario).
- `src/web/` rendering, screens, HUD, audio, settings only: `main.ts` (flow + loop), `world3d.ts` (three.js view),
  `hud.ts`, `audio.ts` (WebAudio synth), `settings.ts` (localStorage), `palette.ts` (Ticket-02 colours).
- `src/tools/autoplay.ts` bot (grid Dijkstra + pad flights) used for winnability tests and replays in `public/replays/`.
- `tests/` vitest; `tests/helpers.ts` (`runCli`, `run`, `scn`, `events`, `snap`) runs the built CLI end-to-end.
  `phase3.test.ts` = AC47–AC57, `phase2.test.ts` = AC23–AC43, `rules`/`headless` = Phase 1 regression.
- `docs/notes/` assumptions per phase (+ AC tables), AI log, retro, `instructor-guide.md` (grading rules + phase DoD
  checklist from the instructor slides). `docs/proof/` evidence; `scripts/proof-headless.sh` regenerates the headless
  evidence files. `docs/lab/` handout (read-only).

## Rules
- `src/sim` must not import `three`, DOM APIs, `Math.random` or `Date`. Randomness only via `Rng` seeded from `--seed`.
- Gameplay numbers live in `src/sim/tuning.ts`; `game.contract.json` `tuning` must match `TUNING` exactly (test enforces).
  Per-night numbers without a contract key (e.g. night 3 shade speed 4.5) live in `maps.ts`.
- Output: only contract fields; coords rounded to 3 decimals via `round3`; events tagged `tick = k+1`; `end` line always last.
- Pause: contract `pause` input toggles in the sim (tick advances, sim_tick freezes). The web freezes by not stepping.
- Extra creative entities must be disabled in headless and must not change contract output.
- Every new rule gets a headless test asserting the JSONL (not just a unit test).
- Never edit test expectations just to make them pass; if a requirement changed, note why (`phase-N-assumptions.md` §1).
- Do not invent requirements: quote the ticket text in `docs/notes/phase-N-assumptions.md` when deciding ambiguities.
- After changing rules: re-run the bot (`npm run autoplay`) for each night; a night the bot can no longer win means
  winnability broke — investigate before touching the bot (a rule that changes the goal, like Ticket-03, does need a
  new bot strategy: say so in docs/notes). Regenerate `public/replays/` so web replays still match.
- Before writing expected values, trace them through the 12-step order (e.g. shades move before contacts; a dash
  replaces horizontal velocity). A new test that fails: decide from the ticket whether the test or the sim is wrong.
- Timing/benchmark claims must check the run reached the stated ticks (`end.ticks`); a lost night ends early.
