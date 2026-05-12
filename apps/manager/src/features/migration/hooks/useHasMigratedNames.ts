import { useQuery } from '@tanstack/react-query'
import { useWalletClient } from 'wagmi'
import { hasMigratedNamesQueryOptions } from '@/features/migration/service/getHasMigratedNames'

export const useHasMigratedNames = () => {
  const { data: walletClient } = useWalletClient()
  const ownerAddress = walletClient?.account?.address
  return useQuery(hasMigratedNamesQueryOptions(ownerAddress ?? undefined))
}
