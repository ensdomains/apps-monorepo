import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  skipToken,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { reconcileRenewedV1Names } from '@/features/migration/service/reconcileRenewedV1Names'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseV1NamesOptions = {
  readonly enabled?: boolean
}

const v1NamesQueryOptions = (
  queryClient: QueryClient,
  address?: string | null,
  enabled: boolean = true,
) =>
  resultQueryOptions({
    queryKey: qk('migration', 'v1_names', {
      address: address?.toLowerCase(),
    }),
    queryFn:
      enabled && address
        ? () =>
            getV1NamesForAddress(address).map((domains) =>
              reconcileRenewedV1Names(queryClient, domains),
            )
        : skipToken,
    staleTime: 5 * 60 * 1000,
  })

export const useV1Names = (options: UseV1NamesOptions = {}) => {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  return useQuery(
    v1NamesQueryOptions(queryClient, ownerAddress ?? address, enabled),
  )
}
