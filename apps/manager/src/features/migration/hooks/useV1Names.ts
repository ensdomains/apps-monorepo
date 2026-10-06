import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  skipToken,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { useDashboardDiscoveryAddresses } from '@/features/dashboard/DashboardNamesProvider'
import {
  getDashboardAuthorityNamesQuery,
  readDashboardAuthorityNames,
} from '@/features/dashboard/service/queries/getDashboardNames'
import { getV1NamesForAddress } from '@/features/migration/service/v1Names'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseV1NamesOptions = {
  readonly enabled?: boolean
}

/** Only a complete, fresh dashboard snapshot can replace the filtered walk. */
const getCachedDashboardRows = (
  queryClient: QueryClient,
  address: string,
  previousDiscoveryAt: number,
) => {
  const source = getDashboardAuthorityNamesQuery(address)
  const state = queryClient.getQueryState(source.queryKey)
  if (
    !state ||
    state.isInvalidated ||
    state.status !== 'success' ||
    state.dataUpdatedAt <= previousDiscoveryAt ||
    Date.now() - state.dataUpdatedAt >= 5 * 60 * 1000
  )
    return undefined
  return state.data
}

const v1NamesQueryOptions = (
  queryClient: QueryClient,
  address?: string | null,
  enabled: boolean = true,
  dashboardAddresses?: readonly string[],
) =>
  resultQueryOptions({
    queryKey: qk('migration', 'v1_names', {
      address: address?.toLowerCase(),
    }),
    queryFn:
      enabled && address
        ? ({ signal }) => {
            const previousDiscoveryAt =
              queryClient.getQueryState(
                qk('migration', 'v1_names', { address: address.toLowerCase() }),
              )?.dataUpdatedAt ?? 0
            const cachedRows = dashboardAddresses
              ? undefined
              : getCachedDashboardRows(
                  queryClient,
                  address,
                  previousDiscoveryAt,
                )
            return getV1NamesForAddress(address, {
              signal,
              loadRows: dashboardAddresses
                ? () =>
                    readDashboardAuthorityNames(
                      queryClient,
                      address,
                      previousDiscoveryAt,
                    )
                : cachedRows
                  ? async () => cachedRows
                  : undefined,
            })
          }
        : skipToken,
    // Renewal runs in another tab, so refresh when the user returns here.
    refetchOnWindowFocus: 'always',
  })

export const useV1Names = (options: UseV1NamesOptions = {}) => {
  const { enabled = true } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const queryClient = useQueryClient()
  const dashboardAddresses = useDashboardDiscoveryAddresses()
  return useQuery({
    ...v1NamesQueryOptions(
      queryClient,
      ownerAddress ?? address,
      enabled,
      dashboardAddresses,
    ),
    staleTime: 5 * 60 * 1000,
  })
}
