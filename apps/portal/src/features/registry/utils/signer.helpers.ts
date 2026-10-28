import type { EOASigner } from '@ens-apps/transaction-manager'
import type { WalletClient } from 'viem'

/** `walletId` (the wagmi connector id) lets an atomic bundle 7702-upgrade vetted wallets. */
export function createEOASigner(
  walletClient: WalletClient,
  walletId?: string,
): EOASigner {
  return {
    type: 'eoa',
    walletClient,
    walletId,
  }
}
