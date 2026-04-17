#!/usr/bin/env bash
# Fund the Rhinestone smart account on the local Anvil Sepolia fork.
#
# The Rhinestone smart account address is deterministic (counterfactual) —
# it depends on the owner's address and the SDK config. This script mints
# MockUSDC and MockDAI to the known address so registration can pay the
# registrar via the mockestrator.
#
# Usage:
#   ./fund-rhinestone-account.sh [ADDRESS]
#
# If ADDRESS is not provided, it mints to a set of known test addresses.
# Add new addresses here as needed.

set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Contract addresses (MockUSDC & MockDAI on Sepolia fork)
MOCK_USDC="0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6"
MOCK_DAI="0xd030a2465ee661338de1f02d05042bbf20d5d127"

# Known Rhinestone smart account addresses (add more as needed)
# These are deterministic based on the Para test wallet + SDK config.
KNOWN_ADDRESSES=(
  "0xC9dDA331341ffE42E6377E35EEbaCC5d4fe24e74"  # Para test1@test.getpara.com (no sessions, no devContracts)
)

fund_address() {
  local addr="$1"
  echo "→ Funding Rhinestone account $addr"

  # Send 1 ETH for gas (needed for impersonated execution in mockestrator)
  cast send "$addr" --value 1ether \
    --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" --quiet 2>/dev/null
  echo "  ✅ 1 ETH sent (for gas)"

  # Mint 10,000 MockUSDC (6 decimals)
  cast send "$MOCK_USDC" "mint(address,uint256)" "$addr" 10000000000 \
    --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" --quiet 2>/dev/null
  echo "  ✅ 10,000 USDC minted"

  # Mint 10,000 MockDAI (18 decimals)
  cast send "$MOCK_DAI" "mint(address,uint256)" "$addr" 10000000000000000000000 \
    --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" --quiet 2>/dev/null
  echo "  ✅ 10,000 DAI minted"
}

echo "=== Funding Rhinestone smart accounts on fork at $RPC_URL ==="

if [[ $# -gt 0 ]]; then
  # Fund specific address from CLI arg
  fund_address "$1"
else
  # Fund all known addresses
  for addr in "${KNOWN_ADDRESSES[@]}"; do
    fund_address "$addr"
  done
fi

echo ""
echo "Done ✅"
