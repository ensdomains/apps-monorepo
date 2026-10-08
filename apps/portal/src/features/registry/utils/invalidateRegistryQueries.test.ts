import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  invalidateRegistryLabelQueries,
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
  it('refreshes holders, history and registry reads', async () => {
    const untouched = [
      'get-registry-label-count',
      { registryAddress: '0x1' },
    ] as const
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS, untouched])
    await invalidateRegistryQueries(queryClient)
    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(untouched)?.isInvalidated).toBe(false)
  })
})

describe('registry label invalidation', () => {
  it('refreshes what a subname created or deleted changes, and not the roles', async () => {
    const labelKeys = [
      ['get-registry-label-count', { registryAddress: '0x1' }],
      ['get-registry-occupants', { address: '0x1' }],
      ['get-registry-history-timeline', { address: '0x1' }],
    ] as const
    const queryClient = seed([...labelKeys, ...ROLE_KEYS])
    await invalidateRegistryLabelQueries(queryClient)
    for (const key of labelKeys)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of ROLE_KEYS)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
  })
})
