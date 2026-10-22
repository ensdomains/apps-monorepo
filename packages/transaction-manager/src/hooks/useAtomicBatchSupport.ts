import { useCapabilities } from 'wagmi'

/**
 * Whether the connected wallet can run an atomic EIP-5792 bundle on `chainId`
 * — the hook form of `getAtomicBatchSupport`, for flows that lay out their
 * steps at render time. `false` while loading or when the wallet has no 5792
 * support, so a flow only ever collapses steps on a positive answer.
 */
export function useAtomicBatchSupport(chainId: number): boolean {
  const { data } = useCapabilities({
    chainId,
    query: { retry: false, staleTime: 60_000 },
  })
  const status = data?.atomic?.status
  return status === 'supported' || status === 'ready'
}
