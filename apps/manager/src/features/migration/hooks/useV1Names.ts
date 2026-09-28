import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseV1NamesOptions = {
  readonly enabled?: boolean
  readonly requireFresh?: boolean
}

const v1NamesQueryOptions = (
  address?: string | null,
  enabled: boolean = true,
) =>
  resultQueryOptions({
    queryKey: qk('migration', 'v1_names', {
      address: address?.toLowerCase(),
    }),
    queryFn:
      enabled && address ? () => getV1NamesForAddress(address) : skipToken,
    staleTime: 5 * 60 * 1000,
  })

export const useV1Names = (options: UseV1NamesOptions = {}) => {
  const { enabled = true, requireFresh = false } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  return useQuery({
    ...v1NamesQueryOptions(ownerAddress ?? address, enabled),
    refetchOnMount: requireFresh ? 'always' : undefined,
  })
}
