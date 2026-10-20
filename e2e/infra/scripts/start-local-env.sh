#!/usr/bin/env bash
# Start the local E2E environment (Anvil fork + Alto bundler + mock paymaster).
#
# Usage:
#   ./start-local-env.sh              # start stack only
#   ./start-local-env.sh <ADDRESS>    # start stack + fund the given address
#   ./start-local-env.sh --down       # tear down the stack
#
# After the stack is healthy the script prints the env vars you need.
# You can copy them into your app's .env or source e2e/.env.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"

# ---------- pinned fork ----------
# Anvil forks Sepolia at the block in infra/fork-block, not at the latest one:
# a pinned fork's reads are cached on disk (anvil-fork-cache volume), and so
# are the bigname router's (bigname-rpc-cache), so after one warm-up run the
# stack needs no public RPC. Move the pin by editing infra/fork-block (then
# expect one slower, online run). SEPOLIA_FORK_BLOCK=latest forks the tip.
: "${SEPOLIA_FORK_BLOCK:=$(tr -d '[:space:]' < "$SCRIPT_DIR/../fork-block")}"
if [[ "$SEPOLIA_FORK_BLOCK" == "latest" ]]; then SEPOLIA_FORK_BLOCK=""; fi
export SEPOLIA_FORK_BLOCK
echo "Anvil fork block: ${SEPOLIA_FORK_BLOCK:-latest}"

# ---------- tear-down shortcut ----------
if [[ "${1:-}" == "--down" ]]; then
  echo "=== Stopping E2E stack ==="
  docker compose -f "$COMPOSE_FILE" --profile bigname down
  echo "Done."
  exit 0
fi

# ---------- bigname settings ----------
BIGNAME_IMAGE="${BIGNAME_IMAGE:-bigname:e2e-anvil-fork}"

# ---------- start ----------
echo "=== Starting E2E stack (Anvil + Alto + Paymaster) ==="
docker compose -f "$COMPOSE_FILE" up -d

# ---------- wait for health ----------
echo ""
echo "Waiting for services to become healthy..."

wait_for_service() {
  local service="$1"
  local max_wait="${2:-120}"
  local elapsed=0
  while [ $elapsed -lt "$max_wait" ]; do
    local health
    health=$(docker compose -f "$COMPOSE_FILE" ps --format json "$service" 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
    if [[ "$health" == "healthy" ]]; then
      echo "  ✅ $service is healthy"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "  ❌ $service did not become healthy within ${max_wait}s"
  return 1
}

# Check that a container is running (for services without a Docker healthcheck).
check_running() {
  local service="$1"
  local state
  state=$(docker compose -f "$COMPOSE_FILE" ps --format json "$service" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State',''))" 2>/dev/null || echo "")
  if [[ "$state" == "running" ]]; then
    echo "  ✅ $service is running"
    return 0
  fi
  echo "  ❌ $service is not running (state: ${state:-unknown})"
  return 1
}

wait_for_service "anvil" 60

# ---------- fund accounts as soon as Anvil is ready ----------
# Funding only needs Anvil (mints tokens via cast). Do it early so the
# accounts have ETH/USDC before the app tries to deploy or register.

# Always fund the default Anvil account (used by portal headless wallet tests)
echo ""
echo "=== Funding default Anvil account (portal headless wallet) ==="
bash "$SCRIPT_DIR/fund-account.sh" "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# Fund additional address if provided as CLI arg
FUND_ADDRESS="${1:-}"
if [[ -n "$FUND_ADDRESS" ]]; then
  echo ""
  echo "=== Funding account: $FUND_ADDRESS ==="
  bash "$SCRIPT_DIR/fund-account.sh" "$FUND_ADDRESS"
fi

echo ""
echo "=== Funding Rhinestone smart accounts ==="
bash "$SCRIPT_DIR/fund-rhinestone-account.sh"

# ---------- wait for remaining services ----------
wait_for_service "alto"  90
# paymaster has no Docker healthcheck — just confirm the container is up
check_running "paymaster"
# mockestrator /health returns 503 — just confirm the container is up
check_running "mockestrator"

# DQA overlay service (design-review comments). See e2e/docs/dqa-overlay.md.
wait_for_service "dqa" 60

# ---------- chain clock and finality ----------
# Two things a fresh pinned fork gets wrong, fixed together:
# 1. Its clock starts at the fork block's timestamp, which falls further behind
#    the wall clock every day; intents and sessions are dated by the wall clock,
#    and HCA registration fails when the chain lags it.
# 2. Anvil runs with --slots-in-an-epoch 1024, so `safe` and `finalized` sit
#    1,024 and 2,048 blocks below the head — below the fork for the first 2,048
#    blocks. bigname polls both, so Anvil keeps fetching pre-fork headers (with
#    full transactions) from the public RPC; offline those are missing and
#    bigname stalls.
# On a fresh chain, mine 2,048 empty blocks one second apart, ending now: the
# clock is current and both tags are local blocks from the start. On a chain
# that has moved on, only step the clock forward (never back: time tests warp
# ahead).
FINALITY_DEPTH=2048
rpc() {
  curl -fsS -X POST -H 'content-type: application/json' --data "$1" http://127.0.0.1:8545
}
sync_chain_clock() {
  local head chain_ts now fork
  read -r head chain_ts < <(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}' |
    python3 -c "import sys,json; b=json.load(sys.stdin)['result']; print(int(b['number'],16), int(b['timestamp'],16))")
  fork=$(rpc '{"jsonrpc":"2.0","id":1,"method":"anvil_nodeInfo","params":[]}' |
    python3 -c "import sys,json; print(json.load(sys.stdin)['result']['forkConfig']['forkBlockNumber'])")
  now=$(date +%s)
  if (( head < fork + FINALITY_DEPTH )) && (( chain_ts < now - FINALITY_DEPTH )); then
    echo "  Fresh fork: mining $FINALITY_DEPTH blocks up to now (clock $(( (now - chain_ts) / 3600 ))h behind)"
    rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"evm_setNextBlockTimestamp\",\"params\":[$(( now - FINALITY_DEPTH + 1 ))]}" >/dev/null
    rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"anvil_mine\",\"params\":[\"0x$(printf '%x' $FINALITY_DEPTH)\",\"0x1\"]}" >/dev/null
    # mockestrator keeps per-chain state (its relayer's view of the chain); a
    # copy left over from the previous fork fails smart-account fills with an
    # on-chain revert (HTTP 500 to the app) until it is restarted.
    echo "  Restarting mockestrator for the new chain"
    docker compose -f "$COMPOSE_FILE" restart mockestrator >/dev/null
    wait_for_service "mockestrator" 60
  elif (( chain_ts < now - 60 )); then
    echo "  Chain clock $(( (now - chain_ts) / 3600 ))h behind; stepping it to now"
    rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"evm_setNextBlockTimestamp\",\"params\":[$now]}" >/dev/null
    rpc '{"jsonrpc":"2.0","id":1,"method":"evm_mine","params":[]}' >/dev/null
  fi
}
sync_chain_clock

# ---------- bigname (the manager's indexer) ----------
# Runs only when the patched image has been built (e2e/infra/bigname/README.md).
# bigname cannot follow a different chain with the database it indexed the last
# one into. With a pinned fork the block alone no longer tells chains apart (a
# restarted Anvil forks the same block and discards its local history), so the
# database is wiped whenever Anvil (re)starts too — keyed on its start time.
anvil_identity() {
  echo "$(anvil_fork_block)/$(docker inspect -f '{{.State.StartedAt}}' \
    "$(docker compose -f "$COMPOSE_FILE" ps -q anvil)" | cut -c1-23)"
}

anvil_fork_block() {
  curl -fsS -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"anvil_nodeInfo","params":[]}' \
    http://127.0.0.1:8545 | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['forkConfig']['forkBlockNumber'])"
}

bigname_psql() {
  docker compose -f "$COMPOSE_FILE" --profile bigname exec -T bigname-postgres \
    psql -U bigname -d bigname -tAc "$1"
}

if docker image inspect "$BIGNAME_IMAGE" >/dev/null 2>&1; then
  echo ""
  echo "=== Starting bigname ==="
  ANVIL_ID=$(anvil_identity)
  INDEXED=$(bigname_psql "SELECT fork_block || '/' || coalesce(anvil_id, '') FROM public.e2e_fork" 2>/dev/null || true)
  if [[ "$INDEXED" != "$ANVIL_ID" ]]; then
    echo "  Anvil is $ANVIL_ID (bigname indexed: ${INDEXED:-nothing})"
    bash "$SCRIPT_DIR/reset-bigname.sh"
  else
    docker compose -f "$COMPOSE_FILE" --profile bigname up -d
    wait_for_service "bigname-api" 120
    bash "$SCRIPT_DIR/wait-for-bigname.sh"
  fi
else
  echo ""
  echo "  ⚠️  $BIGNAME_IMAGE not built; skipping bigname (see e2e/infra/bigname/README.md)."
  echo "     The manager then needs E2E_MOCK_BIGNAME=true."
fi

# ---------- print env ----------
echo ""
echo "=== Environment variables for the app ==="
echo ""
echo "  # Local bundler/paymaster (used by ERC-4337 fallback path)"
echo "  VITE_SEPOLIA_RPC_URL=http://127.0.0.1:8545   (manager)"
echo "  VITE_RPC_URL=http://127.0.0.1:8545           (explorer)"
echo "  VITE_PIMLICO_BUNDLER_URL=/bundler   (Vite proxy → 127.0.0.1:4337)"
echo ""
echo "  # Rhinestone path (default smart-account provider)"
echo "  VITE_RHINESTONE_ENDPOINT_URL=/orchestrator   (Vite proxy → 127.0.0.1:3007)"
echo '  VITE_RHINESTONE_CUSTOM_RPC_URLS={"11155111":"http://127.0.0.1:8545"}'
echo ""
echo "  # bigname (manager) — only when the image is built"
echo "  VITE_BIGNAME_API_URL=http://127.0.0.1:5660"
echo ""
echo "  # DQA overlay (design review — optional; see e2e/docs/dqa-overlay.md)"
echo "  VITE_DQA=1"
echo "  VITE_DQA_URL=http://localhost:4000"
echo ""
echo "Copy these into your app's .env and (re)start the dev server so Vite picks them up."
echo ""
echo "To stop the stack later:"
echo "  $0 --down"
