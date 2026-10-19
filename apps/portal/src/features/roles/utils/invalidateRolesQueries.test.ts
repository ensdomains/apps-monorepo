import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getAddressNamesQueryOptions } from '@/features/dashboard/hooks/useAddressNames'
import { getAddressRoleCountsQueryOptions } from '@/features/dashboard/hooks/useAddressRoleCounts'
import { ROOT_RESOURCE_ID } from '@/lib/resource/resourceId'
import { getNameRolesAccountsQueryOptions } from '../hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '../hooks/useNameRolesForAccount'
import { getRoleHistoryQueryOptions } from '../hooks/useRoleHistory'
import { invalidateRolesQueries } from './invalidateRolesQueries'

const NAME = 'alice.eth'
const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const RESOURCE = ROOT_RESOURCE_ID

// Keys from the options the reads use, so a key renamed on one side fails here.
const ROLE_KEYS = [
  getNameRolesAccountsQueryOptions({
    name: NAME,
    resource: RESOURCE,
    registryAddress: REGISTRY,
  }).queryKey,
  getNameRolesForAccountQueryOptions({
    registryAddress: REGISTRY,
    resource: RESOURCE,
    account: ACCOUNT,
  }).queryKey,
  getRoleHistoryQueryOptions({ name: NAME, registryAddress: REGISTRY })
    .queryKey,
]

const INDEXED_KEYS = [
  getAddressRoleCountsQueryOptions({ address: ACCOUNT }).queryKey,
  getAddressNamesQueryOptions({ address: ACCOUNT }).queryKey,
]

const UNRELATED_KEY = ['get-ens-owner', { name: NAME }]

const seed = () => {
  const queryClient = new QueryClient()
  for (const key of [...ROLE_KEYS, ...INDEXED_KEYS, UNRELATED_KEY])
    queryClient.setQueryData(key, 'cached')
  return queryClient
}

const isStale = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true

describe('invalidateRolesQueries', () => {
  it('refreshes the role reads and the indexed name lists', async () => {
    const queryClient = seed()

    await invalidateRolesQueries(queryClient)

    for (const key of [...ROLE_KEYS, ...INDEXED_KEYS])
      expect(isStale(queryClient, key)).toBe(true)
    expect(isStale(queryClient, UNRELATED_KEY)).toBe(false)
  })

  it('leaves the indexed name lists for after indexing', async () => {
    const queryClient = seed()

    await invalidateRolesQueries(queryClient, { isIndexed: false })

    for (const key of ROLE_KEYS) expect(isStale(queryClient, key)).toBe(true)
    for (const key of INDEXED_KEYS)
      expect(isStale(queryClient, key)).toBe(false)
    expect(isStale(queryClient, UNRELATED_KEY)).toBe(false)
  })
})
