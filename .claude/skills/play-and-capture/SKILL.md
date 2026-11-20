---
name: play-and-capture
description: Play Night 1 automatically (bot), cross-check the win through the headless CLI, replay it in the 3D web build and save screenshots as evidence. Use when a phase needs visual/gameplay proof or after changing rules or rendering.
---

# Play and capture evidence

1. Generate a winning input script with the bot (plays through the real `src/sim`):
   `npm run autoplay -- --seed 7 --out public/replays/seed7-win.inputs.json`
   Exit code 0 means the bot won. If it fails, the rules or tuning likely broke winnability — investigate, do not tweak the bot to hide it.
2. Cross-check through the graded path (must print `"state":"won"` with the same score/ticks as step 1):
   `node dist-headless/headless/cli.js --seed 7 --night 1 --ticks 18000 --inputs public/replays/seed7-win.inputs.json --out /tmp/r.jsonl && tail -1 /tmp/r.jsonl`
3. Build and serve the web game: `npm run build && npx vite preview --port 4173`
4. Open `http://localhost:4173/?seed=7&replay=replays/seed7-win.inputs.json&speed=2` (Claude in Chrome).
   Take screenshots every ~3 s (≈22 s total at speed 2) and save the interesting ones
   (start, first lantern lit, shades chasing, final "Đảo đã sáng lại!" screen) to `docs/proof/phase-N/`.
5. Confirm the final score on screen equals the headless `end` line; record both in `docs/proof/README.md`.

`tests/autoplay.test.ts` already runs steps 1–2 for seeds 1, 7, 42 on every `npm test`.
