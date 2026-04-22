import { useQuery } from '@tanstack/react-query'
import { migratedNamesCountQueryOptions } from '@/features/migration/service/getMigratedNamesCount'
import { useSmartAccountContext } from '@/lib/smart-account'

export const useMigratedNamesCount = () => {
  const { ownerAddress } = useSmartAccountContext()
  return useQuery(migratedNamesCountQueryOptions(ownerAddress ?? undefined))
}
