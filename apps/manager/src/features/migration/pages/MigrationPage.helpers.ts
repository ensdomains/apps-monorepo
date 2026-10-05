import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const isMigrationQueryKey = (key: QueryKey): boolean => {
  const first = key[0]
  if (first === 'migration-preflight') return true
  if (
    typeof first === 'object' &&
    first !== null &&
    '$scope' in first &&
    (first as { $scope: unknown }).$scope === 'migration'
  ) {
    return true
  }
  return false
}

export const invalidateMigrationQueries = async (
  queryClient: QueryClient,
): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) => isMigrationQueryKey(query.queryKey),
    }),
    // The dashboard is unmounted during migration. Start refreshing its cached
    // name lists while the success dialog is open, including inactive variants.
    ...['domains', 'all_domains', 'role_assignments'].map(($action) =>
      queryClient.invalidateQueries({
        queryKey: qk('dashboard', $action),
        refetchType: 'all',
      }),
    ),
  ])
}
