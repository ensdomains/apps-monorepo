import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  invalidateIndexedRegistryQueries,
  invalidateRegistryQueries,
} from './invalidateRegistryQueries'

const ROLE_KEYS = [
  ['get-registry-root-role-holders', { registryAddress: '0x1' }],
  ['get-registry-role-history-for-account', { registryAddress: '0x1' }],
] as const

const BIGNAME_KEYS = [
  ['get-registry-info', { registryAddress: '0x1' }],
  ['get-registry-labels', { registryAddress: '0x1' }],
] as const

const seed = (keys: readonly (readonly unknown[])[]) => {
  const queryClient = new QueryClient()
  for (const key of keys) queryClient.setQueryData(key, [])
  return queryClient
}

// Against bigname v0.4.1 the role holder and history reads scan the node's
// logs, which are current once the grant or revoke confirms; if they miss the
// success invalidation the holders table keeps showing revoked permissions
// until an unrelated refetch.
describe('invalidateRegistryQueries', () => {
  it('refreshes the role holder and history reads on success', async () => {
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS])

    await invalidateRegistryQueries(queryClient)

    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })

  // A log scan is already current, so refreshing it again once bigname has
  // caught up would rescan the registry for nothing.
  it('refreshes only the bigname reads again while the role reads scan logs', async () => {
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS])
    queryClient.setQueryData(['bigname-root-role-reads-supported'], false)

    await invalidateIndexedRegistryQueries(queryClient)

    for (const key of BIGNAME_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
    for (const key of ROLE_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    }
  })

  // Read from bigname, the same reads lag like the rest: without the second
  // refresh the table would keep the holders from before the transaction.
  it('refreshes the role reads again too once bigname serves them', async () => {
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS])
    queryClient.setQueryData(['bigname-root-role-reads-supported'], true)

    await invalidateIndexedRegistryQueries(queryClient)

    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })
})
