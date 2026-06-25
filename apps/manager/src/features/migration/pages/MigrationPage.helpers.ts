import type { QueryKey } from '@tanstack/react-query'

const REFRESH_SCOPES = new Set(['dashboard', 'migration', 'profile'])

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

export const isPostMigrationRefreshQueryKey = (key: QueryKey): boolean => {
  if (isMigrationQueryKey(key)) return true
  const first = key[0]
  return (
    typeof first === 'object' &&
    first !== null &&
    '$scope' in first &&
    typeof (first as { $scope: unknown }).$scope === 'string' &&
    REFRESH_SCOPES.has((first as { $scope: string }).$scope)
  )
}
