import type { EOASigner } from '@ens-apps/transaction-manager'
import { getConnection } from '@wagmi/core/actions'
import type { WalletClient } from 'viem'
import { wagmiConfig } from '@/lib/wagmi'

/**
 * Signs with the connected wallet. Its connector id lets an atomic bundle
 * 7702-upgrade vetted wallets, and the connector tells a Safe{Wallet} apart.
 */
export function createEOASigner(walletClient: WalletClient): EOASigner {
  const { connector } = getConnection(wagmiConfig)
  return { type: 'eoa', walletClient, walletId: connector?.id, connector }
}
