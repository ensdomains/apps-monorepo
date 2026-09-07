/**
 * Invalidates all role-related queries.
 *
 * Used after grant/revoke transactions so the roles table, history panel and
 * canManageRoles check refetch.
 */

import type { QueryClient } from '@tanstack/react-query'

const rolesQueryKeys = new Set([
  'get-name-roles-accounts',
  'getNameRolesForAccount',
  // History panel in the roles sidebar: a grant or revoke is a new entry.
  'get-role-history',
])

export function invalidateRolesQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => rolesQueryKeys.has(query.queryKey[0] as string),
    refetchType: 'all',
  })
}
