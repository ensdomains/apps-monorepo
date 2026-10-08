import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateRegistryQueries } from './invalidateRegistryQueries'

// The role holder and history reads come from the indexer, which lags a
// confirmed grant or revoke. If they drop out of the polled set the holders
// table can keep showing revoked permissions until the next unrelated refetch.
describe('invalidateRegistryQueries', () => {
  it('polls the role holder and history reads', async () => {
    const queryClient = new QueryClient()
    const keys = [
      ['get-registry-root-role-holders', { registryAddress: '0x1' }],
      ['get-registry-role-history-for-account', { registryAddress: '0x1' }],
    ] as const
    for (const key of keys) queryClient.setQueryData(key, [])

    await invalidateRegistryQueries(queryClient)

    for (const key of keys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })
})
