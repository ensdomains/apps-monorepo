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
  docker compose -f "$COMPOSE_FILE" down
  echo "Done."
  exit 0
fi

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

wait_for_service "anvil" 60

# ---------- fund accounts as soon as Anvil is ready ----------
# Funding only needs Anvil (mints tokens via cast). Do it early so the
# smart account has ETH/USDC/DAI before the app tries to deploy or register.
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
wait_for_service "paymaster" 90
# Mockestrator health returns 503 (no /health endpoint) — wait briefly but don't block
wait_for_service "mockestrator" 30 || echo "  ⚠️  mockestrator health check inconclusive (this is normal)"

# ---------- print env ----------
echo ""
echo "=== Environment variables for the app ==="
echo ""
echo "  # Pimlico/ZeroDev path (default)"
echo "  VITE_SEPOLIA_RPC_URL=http://127.0.0.1:8545"
echo "  VITE_PIMLICO_BUNDLER_URL=/bundler   (Vite proxy → 127.0.0.1:4337)"
echo "  VITE_PAYMASTER_URL=/paymaster       (Vite proxy → 127.0.0.1:3002)"
echo ""
echo "  # Rhinestone path (add these to use Rhinestone instead of Pimlico)"
echo "  VITE_FF_RHINESTONE_SESSIONS=true"
echo "  VITE_RHINESTONE_ENDPOINT_URL=/orchestrator   (Vite proxy → 127.0.0.1:3007)"
echo "  VITE_RHINESTONE_USE_DEV_CONTRACTS=true"
echo '  VITE_RHINESTONE_CUSTOM_RPC_URLS={"11155111":"http://127.0.0.1:8545"}'
echo ""
echo "Copy these into your app's .env and (re)start the dev server so Vite picks them up."
echo ""
echo "To stop the stack later:"
echo "  $0 --down"
