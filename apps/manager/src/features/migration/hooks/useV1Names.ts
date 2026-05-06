import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useWalletClient } from 'wagmi'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'

const v1NamesQueryOptions = (address?: string | null) =>
  resultQueryOptions({
    queryKey: qk('migration', 'v1_names', {
      address: address?.toLowerCase(),
    }),
    queryFn: address ? () => getV1NamesForAddress(address) : skipToken,
    staleTime: 5 * 60 * 1000,
  })

export const useV1Names = () => {
  const { data: walletClient } = useWalletClient()
  const ownerAddress = walletClient?.account?.address
  return useQuery(v1NamesQueryOptions(ownerAddress))
}
