---
name: play-and-capture
description: Play each night (1–3) automatically with the bot, cross-check every win through the headless CLI, replay the whole 3-night run in the 3D web build and save screenshots as evidence. Use when a phase needs visual/gameplay proof or after changing rules or rendering.
---

# Play and capture evidence

1. Generate a winning input script per night with the bot (plays through the real `src/sim`):
   `npm run autoplay -- --seed 7 --night N` for N = 1, 2, 3 → `public/replays/nN-seed7-win.inputs.json`.
   Exit code 0 means the bot won. If a night fails, the rules or tuning likely broke winnability — investigate, do not
   tweak the bot to hide it. (The bot is not optimal on night 3: motes are scarce; it wins ~9/12 seeds. Try another seed
   only after checking the loss is a bot weakness, e.g. stuck at a wall, and say so in `docs/notes/`.)
2. Cross-check through the graded path (must print `"state":"won"` with the same score/ticks as step 1):
   `node dist-headless/headless/cli.js --seed 7 --night N --ticks 21600 --inputs public/replays/nN-seed7-win.inputs.json --out /tmp/r.jsonl && tail -1 /tmp/r.jsonl`
3. Build and serve the web game: `npm run build && npx vite preview --port 4173`
4. Open with Claude in Chrome:
   - whole run: `http://localhost:4173/?seed=7&replay=replays/n{night}-seed7-win.inputs.json&speed=40&fps=1`
     (result screen → click "Đêm N+1 →" → Enter on the intro → … → "Đón Bình Minh →"),
   - one night: `?seed=7&night=N&replay=replays/nN-seed7-win.inputs.json&speed=2`.
   The automation window is usually occluded, so Chrome throttles rAF to 1–4 frames/s: use a high `speed`, wait, then
   screenshot (scale 0.6). To catch a short moment (e.g. the deposit prompt), poll the DOM in `javascript_tool` and
   dispatch `KeyP` to pause on it.
5. Save the interesting screenshots to `docs/proof/phase-N/` (menu, intro, HUD, pause, settings, each night's result,
   Bình Minh, a lost night) and confirm each on-screen score equals the headless `end` line; record both in
   `docs/proof/README.md`.
6. FPS: run `__bench(180)` in the console late in night 3 (most shades + lights); it renders at 1280×720 and waits for
   the GPU each frame. Record ms/frame and the GPU; ask the user to confirm the live `?fps=1` average in a visible window.

`tests/autoplay.test.ts` already runs steps 1–2 for every night on each `npm test`.
