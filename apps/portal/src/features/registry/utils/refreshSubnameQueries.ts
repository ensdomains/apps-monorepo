import type { QueryClient } from '@tanstack/react-query'
import { getAddressNamesQueryKey } from '@/features/dashboard/hooks/useAddressNames'
import { getRegistrationDataQueryOptions } from '@/features/profile/hooks/useRegistrationData'
import { getSubnamesQueryKey } from '@/features/profile/hooks/useSubnames'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import type { ProtocolVersion } from '@/utils/types'
import { invalidateRegistryLabelQueries } from './invalidateRegistryQueries'

/**
 * After a subname is created, deleted or changed: the parent's subnames now,
 * then again with the registry's label count, table, feed and occupancy, the
 * address names lists, and each of `changedSubnames`' own expiry, once bigname
 * has indexed the write.
 */
export const refreshSubnameQueries = (
  queryClient: QueryClient,
  parent: { readonly name: string; readonly protocolVersion: ProtocolVersion },
  changedSubnames: readonly string[] = [],
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
        queryClient.invalidateQueries({
          queryKey: [getAddressNamesQueryKey.key],
        }),
        ...changedSubnames.map((name) =>
          queryClient.invalidateQueries({
            queryKey: getRegistrationDataQueryOptions({ name }).queryKey,
          }),
        ),
      ])
    },
  })
}
