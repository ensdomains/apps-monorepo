import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { getAddressRoleCountsQueryKey } from '@/features/dashboard/hooks/useAddressRoleCounts'
import { getNameRolesAccountsQueryKey } from '../hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryKey } from '../hooks/useNameRolesForAccount'
import { getRoleHistoryQueryKey } from '../hooks/useRoleHistory'
import { invalidateRolesQueries } from './invalidateRolesQueries'

describe('invalidateRolesQueries', () => {
  // Keyed through the factories the reads use, so a renamed key fails here.
  it.each([
    getNameRolesAccountsQueryKey.key,
    getNameRolesForAccountQueryKey.key,
    getRoleHistoryQueryKey.key,
    getAddressRoleCountsQueryKey.key,
  ])('invalidates %s', async (key) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData([key, { name: 'alice.eth' }], 'cached')

    await invalidateRolesQueries(queryClient)

    expect(
      queryClient.getQueryState([key, { name: 'alice.eth' }])?.isInvalidated,
    ).toBe(true)
  })
})
