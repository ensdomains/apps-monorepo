import type { WalletClient } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

/**
 * Narrow a wallet client to one that's ready to build a transaction intent —
 * i.e. it has both an `account` and a resolved `chain`. Returns `undefined`
 * otherwise, so intent sites uniformly skip estimation instead of the
 * `prepare*Transaction` builders throwing during render (they require both, and
 * a wallet connected to a chain outside the wagmi config exposes an account but
 * no chain). Centralizing the check keeps every intent site's guard identical
 * and stops a new flow from reintroducing the missing-chain render crash.
 */
export function walletClientIfReady(
  walletClient: WalletClient | undefined,
): WalletClientWithAccount | undefined {
  return walletClient?.account && walletClient.chain
    ? (walletClient as WalletClientWithAccount)
    : undefined
}
