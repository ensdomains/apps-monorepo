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

describe('registry role invalidation', () => {
  it.each([
    ['on confirmation', invalidateRegistryQueries],
    ['after indexing', invalidateIndexedRegistryQueries],
  ])('refreshes holders, history and registry reads %s without a capability flag', async (_, invalidate) => {
    const untouched = [
      'get-registry-label-count',
      { registryAddress: '0x1' },
    ] as const
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS, untouched])
    await invalidate(queryClient)
    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(untouched)?.isInvalidated).toBe(false)
  })
})
