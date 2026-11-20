---
name: play-and-capture
description: Play each night (1–3) automatically with the bot, cross-check every win through the headless CLI, replay the whole 3-night run in the 3D web build and save screenshots as evidence. Use when a phase needs visual/gameplay proof or after changing rules or rendering.
---

# Play and capture evidence

1. Generate a winning input script per night with the bot (plays through the real `src/sim`):
   `npm run autoplay -- --seed S --night N` with (N, S) = (1, 7), (2, 11), (3, 1) → `public/replays/nN-seedS-win.inputs.json`.
   Exit code 0 means the bot won (`dawn_survived`). Since Ticket-03 the bot is weak on nights 2–3 (seed scan in
   `docs/notes/phase-3-assumptions.md` §6): only use seeds it is known to win, and say so in `docs/notes/`.
2. Cross-check through the graded path (must print `"state":"won"` with the same score/ticks as step 1):
   `node dist-headless/headless/cli.js --seed S --night N --ticks 21600 --inputs public/replays/nN-seedS-win.inputs.json --out /tmp/r.jsonl && tail -1 /tmp/r.jsonl`
3. Build and serve the web game: `npm run build && npx vite preview --port 4173`
4. Open with Claude in Chrome:
   - whole run: `http://localhost:4173/?seed=7,11,1&replay=replays/n{night}-seed{seed}-win.inputs.json&speed=40&fps=1`
     (result screen → click "Đêm N+1 →" → Enter on the intro → … → "Đón Bình Minh →"),
   - one night: `?seed=S&night=N&replay=replays/nN-seedS-win.inputs.json&speed=2`.
   - if port 4173 is taken by an old preview, use another port: an old server may serve a stale build.
   The automation window is usually occluded, so Chrome throttles rAF to 1–4 frames/s: use a high `speed`, wait, then
   screenshot (scale 0.6). To catch a short moment (e.g. the deposit prompt), poll the DOM in `javascript_tool` and
   dispatch `KeyP` to pause on it.
5. Save the interesting screenshots to `docs/proof/phase-N/` (menu, intro, HUD, pause, settings, each night's result,
   Bình Minh, a lost night) and confirm each on-screen score equals the headless `end` line; record both in
   `docs/proof/README.md`.
6. FPS: run `__bench(180)` in the console late in night 3 (most shades + lights); it renders at 1280×720 and waits for
   the GPU each frame. Record ms/frame and the GPU; ask the user to confirm the live `?fps=1` average in a visible window.

7. Headless evidence files (replay end lines, run-twice determinism, 21 600-tick timing, a sample JSONL):
   `scripts/proof-headless.sh docs/proof/phase-N/headless` — rerun after the final commit of the phase so `env.txt`
   names the tagged commit, and link the files from `docs/proof/README.md`.

`tests/autoplay.test.ts` already runs steps 1–2 for every night on each `npm test`.
