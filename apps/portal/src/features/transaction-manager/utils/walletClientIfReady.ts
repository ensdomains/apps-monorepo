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
 *
 * When `expectedChainId` is given, a wallet on any *other* chain is also treated
 * as not-ready: the intent is built for `expectedChainId`, so estimating against
 * a wallet scoped to a different chain would resolve the wrong contracts (or
 * throw). Reporting not-ready lets the UI prompt the user to switch networks
 * instead of silently producing a wrong-chain estimate.
 */
export function walletClientIfReady(
  walletClient: WalletClient | undefined,
  expectedChainId?: number,
): WalletClientWithAccount | undefined {
  if (!walletClient?.account || !walletClient.chain) return undefined
  if (expectedChainId != null && walletClient.chain.id !== expectedChainId) {
    return undefined
  }
  return walletClient as WalletClientWithAccount
}
