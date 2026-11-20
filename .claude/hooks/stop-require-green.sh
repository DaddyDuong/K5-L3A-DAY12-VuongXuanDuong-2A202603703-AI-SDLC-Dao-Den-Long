#!/usr/bin/env bash
# Stop hook: block the agent from finishing while the test suite is red.
input=$(cat)
# Avoid infinite loops: if we already blocked once in this stop cycle, let it stop.
if echo "$input" | grep -q '"stop_hook_active": *true'; then exit 0; fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0
if ! out=$(npm test --silent 2>&1); then
  echo "Tests are failing — fix them before finishing (or explain why in docs/notes)." >&2
  echo "$out" | tail -40 >&2
  exit 2
fi
exit 0
