#!/usr/bin/env bash
# Block until the local bigname has published Anvil's current head.
#
# On a new fork the runner first backfills from its start block (see
# ../bigname/runner.sh), which takes minutes; after that it follows Anvil
# within a second or two. `/v1/status` readiness is not used: it also checks
# the block's age against wall time, and Anvil only mines on demand (and the
# suite warps its clock), so a fully caught-up index can still read "degraded".
#
# Usage: wait-for-bigname.sh [timeout-seconds]   (default 1800)
set -euo pipefail

BIGNAME_URL="${BIGNAME_URL:-http://127.0.0.1:5660}"
ANVIL_URL="${ANVIL_URL:-http://127.0.0.1:8545}"
TIMEOUT="${1:-1800}"

head_block() {
  curl -fsS -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' "$ANVIL_URL" |
    python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'], 16))"
}

indexed_block() {
  curl -fsS "$BIGNAME_URL/v1/status" 2>/dev/null |
    python3 -c "import sys,json; c=json.load(sys.stdin)['data']['chains'].get('11155111') or {}; print(c.get('indexed_block') or 0)" 2>/dev/null ||
    echo 0
}

target=$(head_block)
start=$SECONDS
last_report=-30
while true; do
  indexed=$(indexed_block)
  if (( indexed >= target )); then
    echo "  ✅ bigname has indexed block $indexed (head $target)"
    exit 0
  fi
  elapsed=$((SECONDS - start))
  if (( elapsed >= TIMEOUT )); then
    echo "  ❌ bigname reached block $indexed of $target within ${TIMEOUT}s" >&2
    echo "     docker compose -f e2e/infra/docker-compose.yml --profile bigname logs bigname-runner" >&2
    exit 1
  fi
  if (( elapsed - last_report >= 30 )); then
    echo "  … bigname at block $indexed of $target (${elapsed}s)"
    last_report=$elapsed
  fi
  sleep 2
done
