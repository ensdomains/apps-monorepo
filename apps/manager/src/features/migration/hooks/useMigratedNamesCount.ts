import { useQuery } from '@tanstack/react-query'
import { useWalletClient } from 'wagmi'
import { migratedNamesCountQueryOptions } from '@/features/migration/service/getMigratedNamesCount'

export const useMigratedNamesCount = () => {
  const { data: walletClient } = useWalletClient()
  const ownerAddress = walletClient?.account?.address
  return useQuery(migratedNamesCountQueryOptions(ownerAddress ?? undefined))
}
