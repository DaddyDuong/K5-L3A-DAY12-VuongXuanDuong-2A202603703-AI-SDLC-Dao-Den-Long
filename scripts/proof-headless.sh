#!/usr/bin/env bash
# Regenerates the headless evidence for a phase (instructor slide 19: scenario input + output log + result,
# determinism = run twice with the same seed and diff, timing of a full 21 600-tick night).
# usage: scripts/proof-headless.sh [phase-dir]   (default docs/proof/phase-2/headless)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-docs/proof/phase-2/headless}"
CLI="node dist-headless/headless/cli.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

npm run build:headless --silent >/dev/null

{
  echo "# git: $(git rev-parse --short HEAD)$(git diff --quiet || echo ' (+ uncommitted changes)')  node: $(node -v)"
  echo "# CPU: $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ //')"
} > "$OUT/env.txt"

: > "$OUT/replays-end.txt"
: > "$OUT/determinism.txt"
: > "$OUT/timing.txt"
for N in 1 2 3; do
  IN="public/replays/n$N-seed7-win.inputs.json"
  # 1. bot replay through the graded CLI: the end line is the result
  $CLI --seed 7 --night "$N" --ticks 21600 --inputs "$IN" --out "$TMP/a$N.jsonl"
  echo "night $N  inputs=$IN  end=$(tail -1 "$TMP/a$N.jsonl")" >> "$OUT/replays-end.txt"
  # 2. determinism: same seed + same inputs twice -> byte-identical
  $CLI --seed 7 --night "$N" --ticks 21600 --inputs "$IN" --out "$TMP/b$N.jsonl"
  if cmp -s "$TMP/a$N.jsonl" "$TMP/b$N.jsonl"; then r="IDENTICAL"; else r="DIFFERENT"; fi
  echo "night $N  seed 7  $(wc -l < "$TMP/a$N.jsonl") lines  sha256 $(sha256sum "$TMP/a$N.jsonl" | cut -c1-16)  run2 $r" >> "$OUT/determinism.txt"
  # 3. a full 21 600-tick night, wall-clock time. The player stands in a lit lantern's safe zone so the night is not
  #    lost early, while shades keep spawning up to the cap (same scenario as test AC43).
  L=$(node -e "const m={1:[0,0,25],2:[0,0,20],3:[0,6,6]}[$N];process.stdout.write(JSON.stringify(m))")
  echo "{\"time_left_s\":400,\"wind_enabled\":false,\"player\":{\"pos\":$L},\"lanterns\":[{\"id\":\"L1\",\"pos\":$L,\"lit\":true}]}" > "$TMP/s$N.json"
  s=$(date +%s%N)
  $CLI --seed 1 --night "$N" --ticks 21600 --scenario "$TMP/s$N.json" --out "$TMP/t$N.jsonl"
  e=$(date +%s%N)
  echo "night $N  seed 1  safe-zone scenario  $(( (e - s) / 1000000 )) ms  (limit 30000 ms)  end=$(tail -1 "$TMP/t$N.jsonl")" >> "$OUT/timing.txt"
done
# keep one full output log as a sample (night 3, sampled every 600 ticks to stay small)
$CLI --seed 7 --night 3 --ticks 21600 --inputs public/replays/n3-seed7-win.inputs.json --snapshot-every 600 \
  --out "$OUT/n3-seed7-every600.jsonl"
cat "$OUT/replays-end.txt" "$OUT/determinism.txt" "$OUT/timing.txt"
