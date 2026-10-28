import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { invalidateDashboardNames } from '@/features/dashboard/service/queries/getDashboardNames'
import type { MigrationError } from '../service/decodeMigrationError'

export const canRetryMigration = (errorType?: MigrationError['type']) =>
  errorType !== 'historical-deployment'

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
    invalidateDashboardNames(queryClient, { refetchType: 'all' }),
  ])
}
