import { useCapabilities, useConnection } from 'wagmi'
import { isAtomicBatchUsable } from '../actors/eoa-batch-transport.actor'

/**
 * Whether the connected wallet can run an atomic EIP-5792 bundle on `chainId`
 * — the hook form of `getAtomicBatchSupport`, for flows that lay out their
 * steps at render time. `ready` (a 7702 upgrade) only counts on wallets whose
 * delegate can own an HCA; `false` while loading, so a flow only collapses
 * steps on a positive answer.
 */
export function useAtomicBatchSupport(chainId: number): boolean {
  const { connector } = useConnection()
  const { data } = useCapabilities({
    chainId,
    query: { retry: false, staleTime: 60_000 },
  })
  return isAtomicBatchUsable(data?.atomic?.status, connector?.id)
}
