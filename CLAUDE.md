# Đảo Đèn Lồng — agent guide

3D third-person game (TypeScript + Three.js + Vite). Graded by a hidden test suite through the
**headless mode** defined by Test Contract v1.0 (lab board, Phase tab). Correct > pretty.

## Commands
- Install/build: `npm ci && npm run build`
- Tests (builds headless first): `npm test`  ← must be green before you finish
- Typecheck: `npm run typecheck`
- Headless: `npm run headless -- --seed 1 --night 1 --ticks 600 --out out.jsonl [--inputs f.json] [--scenario f.json]`
- Play: `npm run dev` (or `npm start` after build)
- Bot win + replay evidence: see skill `play-and-capture` (`npm run autoplay -- --seed 7`)

## Layout
- `src/sim/` pure game logic, shared by web + headless. `step(world, input)` = exactly one 1/60 s tick.
- `src/headless/cli.ts` contract CLI (exit 0 ok, 1 usage/IO, 2 malformed inputs/scenario).
- `src/web/` rendering + keyboard only. Never put gameplay rules here.
- `tests/` vitest; `tests/helpers.ts#runCli` runs the built CLI end-to-end.
- `docs/notes/` assumptions per phase, AI log, retro. `docs/proof/` evidence. `docs/lab/` lab handout (read-only).

## Rules
- `src/sim` must not import `three`, DOM APIs, `Math.random` or `Date`. Randomness only via `Rng` seeded from `--seed`.
- Gameplay numbers live in `src/sim/tuning.ts`; `game.contract.json` `tuning` must match it exactly (test enforces).
- Output: coords rounded to 3 decimals via `round3`; events tagged `tick = k+1`; `end` line always last.
- Extra creative entities must be disabled in headless and must not change contract output.
- Every new rule gets a headless test asserting the JSONL (not just a unit test).
- Never edit test expectations just to make them pass; if a requirement changed, note why in `docs/notes/`.
- Do not invent requirements: quote the ticket text in `docs/notes/phase-N-assumptions.md` when deciding ambiguities.
