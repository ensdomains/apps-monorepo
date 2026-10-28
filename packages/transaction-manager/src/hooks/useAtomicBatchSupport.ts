import { useSyncExternalStore } from 'react'
import { useCapabilities, useConnection } from 'wagmi'
import { isAtomicBatchUsable } from '../actors/eoa-batch-transport.actor'
import {
  hasDeclinedUpgrade,
  subscribeUpgradeDeclines,
} from '../services/upgrade-declines.service'

/**
 * Whether the connected account declined the EIP-7702 upgrade an atomic bundle
 * asked for on `chainId`. Nothing in that bundle was sent, so a flow that
 * planned it can switch to separate transactions.
 */
export function useHasDeclinedAtomicUpgrade(chainId: number): boolean {
  const { address } = useConnection()
  return useSyncExternalStore(
    subscribeUpgradeDeclines,
    () => hasDeclinedUpgrade(address, chainId),
    () => false,
  )
}

/**
 * Whether the connected wallet can run an atomic EIP-5792 bundle on `chainId`
 * — the hook form of `getAtomicBatchSupport`, for flows that lay out their
 * steps at render time. `ready` (a 7702 upgrade) only counts on wallets whose
 * delegate can own an HCA, until the user declines it; `false` while loading,
 * so a flow only collapses steps on a positive answer.
 */
export function useAtomicBatchSupport(chainId: number): boolean {
  const { connector } = useConnection()
  const hasDeclined = useHasDeclinedAtomicUpgrade(chainId)
  const { data } = useCapabilities({
    chainId,
    query: { retry: false, staleTime: 60_000 },
  })
  return isAtomicBatchUsable({
    status: data?.atomic?.status,
    walletId: connector?.id,
    hasDeclinedUpgrade: hasDeclined,
  })
}
