import type { QueryClient } from '@tanstack/react-query'
import { getSubnamesQueryKey } from '@/features/profile/hooks/useSubnames'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import type { ProtocolVersion } from '@/utils/types'
import { invalidateRegistryLabelQueries } from './invalidateRegistryQueries'

/**
 * After a subname is created or deleted: the parent's subnames now, then
 * again with the registry's label count, table, feed and occupancy once
 * bigname has indexed the write.
 */
export const refreshSubnameQueries = (
  queryClient: QueryClient,
  parent: { readonly name: string; readonly protocolVersion: ProtocolVersion },
) => {
  const invalidateSubnames = () =>
    queryClient.invalidateQueries({
      queryKey: getSubnamesQueryKey(parent),
      refetchType: 'all',
    })
  void invalidateSubnames()
  void pollForIndexerSync({
    invalidateQueries: async () => {
      await Promise.all([
        invalidateSubnames(),
        invalidateRegistryLabelQueries(queryClient),
      ])
    },
  })
}
