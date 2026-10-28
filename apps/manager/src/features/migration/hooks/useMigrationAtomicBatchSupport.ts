import { useCapabilities } from 'wagmi'
import { chain } from '@/config'

export const useMigrationAtomicBatchSupport = () => {
  const { data } = useCapabilities({
    chainId: chain.id,
    query: { retry: false, staleTime: 60_000 },
  })
  const status = data?.atomic?.status

  return {
    canBatchAtomically: status === 'supported' || status === 'ready',
    requiresUpgrade: status === 'ready',
  }
}
