import { type Address, type Client, parseAbi } from 'viem'
import { readContract } from 'viem/actions'

/**
 * Dynamic EIP-2612 support detection — an on-chain read, never an address allowlist.
 *
 * EIP-2612 has no ERC-165 interface id (the standard mandates only three functions and no
 * `supportsInterface`), so support is probed via the two view functions every compliant token must
 * expose: `nonces(owner)` and `DOMAIN_SEPARATOR()`. Both returning cleanly is the standard heuristic
 * wallets/SDKs use. This lets the mock USDC/DAI, real USDC, and USDS all light up the one-tx
 * `mintSelfWithPermit` path automatically, while anything that doesn't answer degrades to
 * approve + `mintSelf` — with no hardcoded token addresses anywhere.
 *
 * Detection is a *hint*, not a guarantee: the voucher's `mintSelfWithPermit` wraps the permit in a
 * try/catch, so a false positive (e.g. a token exposing the getters but a non-standard DAI-classic
 * `permit`) can only cost the user a separate `approve`, never mis-spend. So the probe only needs to
 * decide "collect a signature vs. send an approve first".
 */

const PERMIT_PROBE_ABI = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
])

/**
 * Whether `token` supports standard EIP-2612 `permit`, by probing `nonces(probeOwner)` and
 * `DOMAIN_SEPARATOR()`. Returns false on any revert / missing function. `probeOwner` defaults to the
 * zero address (a valid `nonces` argument on every compliant token).
 *
 * Callers should cache the result per token address (it's immutable per token).
 */
export async function supportsPermit2612(
  client: Client,
  token: Address,
  probeOwner: Address = '0x0000000000000000000000000000000000000000',
): Promise<boolean> {
  try {
    // `nonces` is the load-bearing probe — a token can expose DOMAIN_SEPARATOR from other EIP-712
    // uses without the 2612 nonces/permit pair. Run both; both must succeed.
    await Promise.all([
      readContract(client, {
        address: token,
        abi: PERMIT_PROBE_ABI,
        functionName: 'nonces',
        args: [probeOwner],
      }),
      readContract(client, {
        address: token,
        abi: PERMIT_PROBE_ABI,
        functionName: 'DOMAIN_SEPARATOR',
      }),
    ])
    return true
  } catch {
    return false
  }
}
