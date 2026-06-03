#!/usr/bin/env bash
# Fund a test account on the local Anvil Sepolia fork.
#
# Usage:
#   ./fund-account.sh <ADDRESS>
#   ./fund-account.sh 0x89b22e5D4f18186F459dF61cea9A489Cedb1028d
#
# What it does:
#   1. Sends 1 ETH to the address (for gas)
#   2. Mints 10 000 MockUSDC (6 decimals)
#   3. Mints 10 000 MockDAI  (18 decimals)
#
# Prerequisites:
#   - Foundry (`cast`) installed
#   - Anvil fork running on RPC_URL (default http://127.0.0.1:8545)

set -euo pipefail

ADDRESS="${1:?Usage: fund-account.sh <ADDRESS>}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

# Anvil's first default account private key (has 10 000 ETH on any fork)
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Contract addresses (MockUSDC & MockDAI deployed on Sepolia — present on fork).
# These must match the payment tokens whitelisted on the current sepolia
# `StandardRentPriceOracle` and exposed to the app via
# `@ens-apps/transaction-manager/contracts/ens-sepolia` (USDC sourced from
# ensjs chain config, DAI hardcoded there). When the V2 deployment rotates
# tokens, update both this script and `SUPPORTED_TOKENS.DAI` in that file.
MOCK_USDC="0x3dfc8b53dafa5ebbb071a8b97678ab534ed838d9"
MOCK_DAI="0xe915cebbc1570a74177b6c589fed1e8f53117559"

echo "=== Funding $ADDRESS on fork at $RPC_URL ==="

# 0. Clear any contract code at the address.
#    The well-known Anvil account 0xf39F…2266 has an EOF contract deployed
#    on Sepolia, which breaks ERC1155 _safeMint (ERC1155InvalidReceiver).
#    Setting the code to 0x makes it an EOA again on the fork.
echo "→ Clearing contract code at $ADDRESS (make it an EOA)..."
cast rpc anvil_setCode "$ADDRESS" "0x" --rpc-url "$RPC_URL" > /dev/null
echo "  ✅ Code cleared"

# 1. Send ETH
echo "→ Sending 1 ETH..."
cast send "$ADDRESS" --value 1ether \
  --private-key "$ANVIL_KEY" \
  --rpc-url "$RPC_URL" \
  --quiet
echo "  ✅ 1 ETH sent"

# 2. Mint MockUSDC (6 decimals → 10_000 * 1e6 = 10000000000)
echo "→ Minting 10 000 MockUSDC..."
cast send "$MOCK_USDC" "mint(address,uint256)" "$ADDRESS" 10000000000 \
  --private-key "$ANVIL_KEY" \
  --rpc-url "$RPC_URL" \
  --quiet
echo "  ✅ 10 000 USDC minted"

# 3. Mint MockDAI (18 decimals → 10_000 * 1e18 = 10000000000000000000000)
echo "→ Minting 10 000 MockDAI..."
cast send "$MOCK_DAI" "mint(address,uint256)" "$ADDRESS" 10000000000000000000000 \
  --private-key "$ANVIL_KEY" \
  --rpc-url "$RPC_URL" \
  --quiet
echo "  ✅ 10 000 DAI minted"

# Print balances
echo ""
echo "=== Balances ==="
ETH_BAL=$(cast balance "$ADDRESS" --rpc-url "$RPC_URL" --ether)
USDC_BAL=$(cast call "$MOCK_USDC" "balanceOf(address)(uint256)" "$ADDRESS" --rpc-url "$RPC_URL")
DAI_BAL=$(cast call "$MOCK_DAI" "balanceOf(address)(uint256)" "$ADDRESS" --rpc-url "$RPC_URL")
echo "  ETH:  $ETH_BAL"
echo "  USDC: $USDC_BAL (raw, 6 decimals)"
echo "  DAI:  $DAI_BAL (raw, 18 decimals)"
echo ""
echo "Done ✅"
