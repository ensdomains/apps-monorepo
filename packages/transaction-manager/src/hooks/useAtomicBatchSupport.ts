import { useCapabilities } from 'wagmi'

/**
 * Whether the connected wallet can run an atomic EIP-5792 bundle on `chainId`
 * — the hook form of `getAtomicBatchSupport`, for flows that lay out their
 * steps at render time. Only `supported` counts (never trigger a 7702 upgrade
 * via `ready`); `false` while loading, so a flow only collapses steps on a
 * positive answer.
 */
export function useAtomicBatchSupport(chainId: number): boolean {
  const { data } = useCapabilities({
    chainId,
    query: { retry: false, staleTime: 60_000 },
  })
  return data?.atomic?.status === 'supported'
}
