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
# The local V1 subgraph stand-in. Without it the Subnames tab, record-key
# discovery and name history render confident negatives for every fork-seeded
# V1 name — see packages/v1-subgraph-shim.
check_running "v1-subgraph"

# DQA overlay service (design-review comments). See e2e/docs/dqa-overlay.md.
wait_for_service "dqa" 60

# ---------- bigname (the manager's indexer) ----------
# Runs only when the patched image has been built (e2e/infra/bigname/README.md).
# bigname cannot follow a different fork with the database it indexed the last
# one into, so the database is wiped whenever Anvil's fork block changes.
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
  FORK_BLOCK=$(anvil_fork_block)
  INDEXED_FORK=$(bigname_psql "SELECT fork_block FROM public.e2e_fork" 2>/dev/null || true)
  if [[ "$INDEXED_FORK" != "$FORK_BLOCK" ]]; then
    echo "  Anvil forked at $FORK_BLOCK (bigname indexed: ${INDEXED_FORK:-nothing})"
    bash "$SCRIPT_DIR/reset-bigname.sh"
  else
    docker compose -f "$COMPOSE_FILE" --profile bigname up -d
    wait_for_service "bigname-api" 120
    bash "$SCRIPT_DIR/wait-for-bigname.sh"
  fi
else
  echo ""
  echo "  ⚠️  $BIGNAME_IMAGE not built; skipping bigname (see e2e/infra/bigname/README.md)."
  echo "     The manager then needs E2E_MOCK_INDEXER=true."
fi

# ---------- print env ----------
echo ""
echo "=== Environment variables for the app ==="
echo ""
echo "  # Local bundler/paymaster (used by ERC-4337 fallback path)"
echo "  VITE_SEPOLIA_RPC_URL=http://127.0.0.1:8545"
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
