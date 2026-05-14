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

# Contract addresses (USDC & DAI on Sepolia fork — must match SUPPORTED_TOKENS in the app)
MOCK_USDC="0x302edecc2b8d1f3f4625b8a825a42f9adc102e65"
MOCK_DAI="0xa01e0eb02d0e92f1302e677d7ce7955b35c390d4"

# Known addresses to fund (add more as needed).
# HCA accounts read balances from the EOA, so we fund BOTH the smart
# account (for gas/impersonation) and the EOA (for token balances).
KNOWN_ADDRESSES=(
  "0xC9dDA331341ffE42E6377E35EEbaCC5d4fe24e74"  # Smart account (testing-2, no sessions)
  "0x38Baa0d0240d293723dC9C4C9732f1792297A8aF"  # Smart account (ensjs-v2, with sessions)
  "0xc9eec1b174a646d7c282820afe94acfba6c00a12"  # EOA for test1@test.getpara.com
)

fund_address() {
  local addr="$1"
  echo "→ Funding Rhinestone account $addr"

  # Send 10 ETH for gas (needed for impersonated execution in mockestrator)
  cast send "$addr" --value 10ether \
    --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" --quiet 2>/dev/null
  echo "  ✅ 10 ETH sent (for gas)"

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
