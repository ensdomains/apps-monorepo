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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Payment-token addresses, resolved from the ensjs Sepolia chain config — the
# SAME source the app uses (`@ens-apps/transaction-manager` SUPPORTED_TOKENS),
# so this script can never drift from the tokens the manager reads/registers
# with. See print-token-addresses.mjs.
eval "$(node "$SCRIPT_DIR/print-token-addresses.mjs")"

# Known addresses to fund (add more as needed).
# HCA accounts read balances from the EOA, so we fund BOTH the smart
# account (for gas/impersonation) and the EOA (for token balances).
KNOWN_ADDRESSES=(
  "0xC9dDA331341ffE42E6377E35EEbaCC5d4fe24e74"  # Smart account (testing-2, no sessions)
  "0x38Baa0d0240d293723dC9C4C9732f1792297A8aF"  # Smart account (ensjs-v2, with sessions)
  "0xc9eec1b174a646d7c282820afe94acfba6c00a12"  # EOA for test1@test.getpara.com
  "0xb0663cbab410d66b3c5b800d8db6231654e888b4"  # HCA for Anvil account 0 / E2E headless wallet (0xf39F…2266)
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
