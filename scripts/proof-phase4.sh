#!/usr/bin/env bash
# Regenerates the Phase 4 measurements (Ticket-04) and their evidence files.
#   bench.json, soak.json        (repo root: the files the DoD asks to commit)
#   docs/proof/phase-4/*.txt     (command output, 30-night memory trace, leaderboard export, unchanged headless output)
# usage: scripts/proof-phase4.sh [--no-bench]     (the bench opens a Chrome window for ~35 s)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=docs/proof/phase-4
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
npm run build --silent >/dev/null 2>&1
C() { node -e "process.stdout.write(require('./game.contract.json')['$1'])"; }

DIRTY=$(git diff --quiet && echo "" || echo " (+ uncommitted changes)")
{
  echo "# git: $(git rev-parse --short HEAD)$DIRTY  node: $(node -v)  date: $(date -Iseconds)"
  echo "# CPU: $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ //')  RAM: $(free -g 2>/dev/null | awk '/Mem:/{print $2" GB"}')"
  echo "# GPU: $(lspci 2>/dev/null | grep -i -m1 'vga' | cut -d: -f3- | sed 's/^ //')"
  echo "# OS: $(uname -sr)  session: ${XDG_SESSION_TYPE:-?}"
  echo "# browser: $( (google-chrome-stable --version || chromium --version) 2>/dev/null | head -1)"
} > "$OUT/env.txt"

# 1. Soak (Ticket-04 §2) exactly as graded, then a 30-night trace of RSS / JS heap after every night.
echo "\$ $(C soak_cmd) --seed 7 --nights 10 --out soak.json" > "$OUT/soak.txt"
$(C soak_cmd) --seed 7 --nights 10 --out soak.json >> "$OUT/soak.txt"
echo "\$ $(C soak_cmd) --seed 7 --nights 30 --out /tmp/s30.json --trace 1" > "$OUT/soak-trace-30-nights.txt"
$(C soak_cmd) --seed 7 --nights 30 --out "$TMP/s30.json" --trace 1 >> "$OUT/soak-trace-30-nights.txt"

# 2. Bench (Ticket-04 §1): real Chrome window, vsync off.
if [ "${1:-}" != "--no-bench" ]; then
  echo "\$ $(C bench_cmd) --seed 42 --duration 30 --out bench.json" > "$OUT/bench.txt"
  $(C bench_cmd) --seed 42 --duration 30 --out bench.json >> "$OUT/bench.txt"
fi

# 3. Leaderboard (Ticket-04 §3): 12 scores saved through the server code into a fresh data dir, then exported with
#    run_cmd. Two share a score (the earlier one must stay above); the board keeps 10.
export DDL_DATA_DIR="$TMP/data"
node --input-type=module -e "
import { saveScore } from './dist-headless/app/server.js';
const rows = [['Mây', 1840, 3], ['Đức_99', 2210, 3], ['lantern_kid', 760, 1], ['Bong_Muc', 0, 0], ['AnhThu', 1320, 2],
  ['tie_first', 1320, 2], ['x_y_z', 95, 0], ['Ông_Đăng', 2900, 3], ['bot7', 1505, 3], ['Lan', 430, 1], ['Minh', 610, 1], ['Nam', 55, 0]];
for (const [name, score, nights_won] of rows) {
  const r = saveScore({ name, score, nights_won, seed: 7 });
  if (typeof r === 'string') throw new Error(r);
  await new Promise((ok) => setTimeout(ok, 1100)); // distinct achieved_at seconds
}"
echo "\$ $(C run_cmd) --export-leaderboard out.json   (12 scores saved, AnhThu saved before tie_first)" > "$OUT/leaderboard-export.txt"
$(C run_cmd) --export-leaderboard "$TMP/out.json"
cat "$TMP/out.json" >> "$OUT/leaderboard-export.txt"
unset DDL_DATA_DIR

# 4. Headless output unchanged by Phase 4: replay the Phase 3 evidence and compare the end lines.
scripts/proof-headless.sh "$TMP/headless" >/dev/null
{
  echo "# docs/proof/phase-3/headless/replays-end.txt vs the same replays at this commit"
  if diff docs/proof/phase-3/headless/replays-end.txt "$TMP/headless/replays-end.txt"; then
    echo "IDENTICAL end lines (night, inputs, ticks, state, score)"
  else echo "DIFFERENT"; fi
  cat "$TMP/headless/replays-end.txt" "$TMP/headless/determinism.txt"
} > "$OUT/headless-unchanged.txt"

cat soak.json "$OUT/headless-unchanged.txt"
[ -f bench.json ] && cat bench.json
