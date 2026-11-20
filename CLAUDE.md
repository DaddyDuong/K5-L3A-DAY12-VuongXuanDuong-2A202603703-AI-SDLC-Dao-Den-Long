# Đảo Đèn Lồng — agent guide

3D third-person game (TypeScript + Three.js + Vite), 3 nights on 3 islands. Graded by a hidden test suite through the
**headless mode** defined by Test Contract **v1.1** (Ticket-02, copied to `docs/notes/ticket-02.md`). Correct > pretty.

## Commands
- Install/build: `npm ci && npm run build`
- Tests (builds headless first): `npm test`  ← must be green before you finish (Stop hook enforces it)
- Typecheck (sim + web + tests): `npm run typecheck`
- Headless: `npm run headless -- --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--inputs f.json] [--scenario f.json]`
- Play: `npm run dev` (or `npm start` after build). `?night=N` jumps to a night, `?fps=1` shows FPS + `__bench(n)`.
- Bot win + replay evidence: skill `play-and-capture` (`npm run autoplay -- --seed 7 --night 3`)

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
  `phase2.test.ts` = AC23–AC43, `rules.test.ts` / `headless.test.ts` = Phase 1 regression on the standard numbers.
- `docs/notes/` assumptions per phase (+ AC tables), AI log, retro. `docs/proof/` evidence. `docs/lab/` handout (read-only).

## Rules
- `src/sim` must not import `three`, DOM APIs, `Math.random` or `Date`. Randomness only via `Rng` seeded from `--seed`.
- Gameplay numbers live in `src/sim/tuning.ts`; `game.contract.json` `tuning` must match `TUNING` exactly (test enforces).
  Per-night numbers without a contract key (e.g. night 3 shade speed 4.5) live in `maps.ts`.
- Output: only contract fields; coords rounded to 3 decimals via `round3`; events tagged `tick = k+1`; `end` line always last.
- Pause: contract `pause` input toggles in the sim (tick advances, sim_tick freezes). The web freezes by not stepping.
- Extra creative entities must be disabled in headless and must not change contract output.
- Every new rule gets a headless test asserting the JSONL (not just a unit test).
- Never edit test expectations just to make them pass; if a requirement changed, note why in `docs/notes/`
  (Phase 1 → Ticket-02 changes are listed in `phase-2-assumptions.md` §1).
- Do not invent requirements: quote the ticket text in `docs/notes/phase-N-assumptions.md` when deciding ambiguities.
- After changing rules: re-run the bot (`npm run autoplay`) for each night; a night the bot can no longer win means
  winnability broke — investigate before touching the bot. Regenerate `public/replays/` so web replays still match.
