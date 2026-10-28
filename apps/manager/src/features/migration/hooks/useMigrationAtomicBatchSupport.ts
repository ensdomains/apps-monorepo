import { useCapabilities } from 'wagmi'
import { chain } from '@/config'

export const useMigrationAtomicBatchSupport = (forceSequential = false) => {
  const { data } = useCapabilities({
    chainId: chain.id,
    query: { retry: false, staleTime: 60_000 },
  })
  const status = data?.atomic?.status

  return {
    canBatchAtomically:
      !forceSequential && (status === 'supported' || status === 'ready'),
    requiresUpgrade: !forceSequential && status === 'ready',
  }
}
