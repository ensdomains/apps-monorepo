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

// The role holder and history reads scan the node's logs, which are current
// once the grant or revoke confirms; if they miss the success invalidation the
// holders table keeps showing revoked permissions until an unrelated refetch.
describe('invalidateRegistryQueries', () => {
  it('refreshes the role holder and history reads on success', async () => {
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS])

    await invalidateRegistryQueries(queryClient)

    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })

  // Polling re-runs every invalidated read until bigname catches up; a log scan
  // in that set would rescan the registry on every tick for nothing.
  it('polls only the bigname reads', async () => {
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS])

    await invalidateIndexedRegistryQueries(queryClient)

    for (const key of BIGNAME_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
    for (const key of ROLE_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    }
  })
})
