#!/usr/bin/env bash
# Regenerates the headless evidence for a phase (instructor slide 19: scenario input + output log + result,
# determinism = run twice with the same seed and diff, timing of a full 21 600-tick night).
# usage: scripts/proof-headless.sh [phase-dir]   (default docs/proof/phase-3/headless)
# Ticket-03: the bot wins night 1/2/3 on seeds 7/11/1 (docs/notes/phase-3-assumptions.md §6), so each night replays
# its own seed.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-docs/proof/phase-3/headless}"
SEEDS=(0 7 7 7) # index = night (replay seed per night)
CLI="node dist-headless/headless/cli.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

npm run build:headless --silent >/dev/null

# check the tree before writing any file here (the redirect below would otherwise make env.txt itself "dirty")
DIRTY=$(git diff --quiet && echo "" || echo " (+ uncommitted changes)")
{
  echo "# git: $(git rev-parse --short HEAD)$DIRTY  node: $(node -v)"
  echo "# CPU: $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ //')"
} > "$OUT/env.txt"

: > "$OUT/replays-end.txt"
: > "$OUT/determinism.txt"
: > "$OUT/timing.txt"
for N in 1 2 3; do
  SD=${SEEDS[$N]}
  IN="public/replays/n$N-seed$SD-win.inputs.json"
  # 1. bot replay through the graded CLI: the end line is the result
  $CLI --seed "$SD" --night "$N" --ticks 21600 --inputs "$IN" --out "$TMP/a$N.jsonl"
  echo "night $N  inputs=$IN  end=$(tail -1 "$TMP/a$N.jsonl")" >> "$OUT/replays-end.txt"
  # 2. determinism: same seed + same inputs twice -> byte-identical
  $CLI --seed "$SD" --night "$N" --ticks 21600 --inputs "$IN" --out "$TMP/b$N.jsonl"
  if cmp -s "$TMP/a$N.jsonl" "$TMP/b$N.jsonl"; then r="IDENTICAL"; else r="DIFFERENT"; fi
  echo "night $N  seed $SD  $(wc -l < "$TMP/a$N.jsonl") lines  sha256 $(sha256sum "$TMP/a$N.jsonl" | cut -c1-16)  run2 $r" >> "$OUT/determinism.txt"
  # 3. a full 21 600-tick night, wall-clock time, shades spawning up to the cap. Ticket-03: the lantern burns out, so
  #    the idle player gets hit; 1000 flames keep the run going to 21 600 ticks (same scenario as test AC43).
  L=$(node -e "const m={1:[0,0,25],2:[0,0,20],3:[0,6,6]}[$N];process.stdout.write(JSON.stringify(m))")
  echo "{\"time_left_s\":400,\"wind_enabled\":false,\"player\":{\"pos\":$L,\"flames\":1000},\"lanterns\":[{\"id\":\"L1\",\"pos\":$L,\"lit\":true}]}" > "$TMP/s$N.json"
  s=$(date +%s%N)
  $CLI --seed 1 --night "$N" --ticks 21600 --scenario "$TMP/s$N.json" --out "$TMP/t$N.jsonl"
  e=$(date +%s%N)
  echo "night $N  seed 1  full-load scenario (1000 flames)  $(( (e - s) / 1000000 )) ms  (limit 30000 ms)  end=$(tail -1 "$TMP/t$N.jsonl")" >> "$OUT/timing.txt"
done
# keep one full output log as a sample (night 3, sampled every 600 ticks to stay small; seed 7 since 3dd65b3)
$CLI --seed 7 --night 3 --ticks 21600 --inputs public/replays/n3-seed7-win.inputs.json --snapshot-every 600 \
  --out "$OUT/n3-seed7-every600.jsonl"
cat "$OUT/replays-end.txt" "$OUT/determinism.txt" "$OUT/timing.txt"
