/**
 * Invalidates all role-related queries.
 *
 * Used after grant/revoke transactions so the roles table, history panel,
 * canManageRoles check and the names tables' role counts refetch.
 */

import type { QueryClient } from '@tanstack/react-query'
import { getAddressNamesQueryKey } from '@/features/dashboard/hooks/useAddressNames'
import { getAddressRoleCountsQueryKey } from '@/features/dashboard/hooks/useAddressRoleCounts'
import { getNameRolesAccountsQueryKey } from '../hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryKey } from '../hooks/useNameRolesForAccount'
import { getRoleHistoryQueryKey } from '../hooks/useRoleHistory'

// These fall back to the node, so they are worth reading before bigname indexes the write.
const ROLE_QUERY_KEYS: readonly unknown[] = [
  getNameRolesAccountsQueryKey.key,
  getNameRolesForAccountQueryKey.key,
  // History panel in the roles sidebar: a grant or revoke is a new entry.
  getRoleHistoryQueryKey.key,
]

// bigname only: a first role on a name adds it to the address's names, a last revoke removes it.
const INDEXED_QUERY_KEYS: readonly unknown[] = [
  getAddressRoleCountsQueryKey.key,
  getAddressNamesQueryKey.key,
]

export function invalidateRolesQueries(
  queryClient: QueryClient,
  { isIndexed = true }: Readonly<{ isIndexed?: boolean }> = {},
): Promise<void> {
  const keys = new Set(
    isIndexed ? [...ROLE_QUERY_KEYS, ...INDEXED_QUERY_KEYS] : ROLE_QUERY_KEYS,
  )
  return queryClient.invalidateQueries({
    predicate: (query) => keys.has(query.queryKey[0]),
  })
}
