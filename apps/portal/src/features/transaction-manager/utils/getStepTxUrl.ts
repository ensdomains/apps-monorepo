import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { Chain, Hash } from 'viem'
import { getBlockExplorerTxUrl } from '@/utils/blockExplorer/getBlockExplorerTxUrl'

/**
 * A step's explorer link. Until a Safe{Wallet} step succeeds, its hash is the
 * Safe's safeTxHash, which no explorer has.
 */
export const getStepTxUrl = ({
  chains,
  chainId,
  hash,
  status,
  isSafeWallet,
}: {
  readonly chains: readonly Chain[]
  readonly chainId: number
  readonly hash: Hash | undefined
  readonly status: TransactionMachineState | undefined
  readonly isSafeWallet: boolean
}): string | undefined =>
  hash && (!isSafeWallet || status === 'success')
    ? getBlockExplorerTxUrl(chains, chainId, hash)
    : undefined
