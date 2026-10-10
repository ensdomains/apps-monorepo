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

const rolesQueryKeys: ReadonlySet<unknown> = new Set([
  getNameRolesAccountsQueryKey.key,
  getNameRolesForAccountQueryKey.key,
  // History panel in the roles sidebar: a grant or revoke is a new entry.
  getRoleHistoryQueryKey.key,
  getAddressRoleCountsQueryKey.key,
  // A first role on a name adds it to the address's names; a last revoke removes it.
  getAddressNamesQueryKey.key,
])

export function invalidateRolesQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => rolesQueryKeys.has(query.queryKey[0]),
    refetchType: 'all',
  })
}
