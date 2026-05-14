import type { QueryKey } from '@tanstack/react-query'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'

export const selectDomainsFromNames = (
  v1Names: readonly V1Domain[],
  selectedNames: readonly string[],
): V1Domain[] => {
  const selectedSet = new Set(selectedNames)
  return v1Names.filter((d) => selectedSet.has(d.name))
}

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
