import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { getRegistryRootRoleHoldersQueryKey } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { registryHistoryTimelineQueryKey } from '../components/v2/RegistryHistory'
import { getRegistryInfoQueryKey } from '../hooks/useRegistry'
import { getRegistryLabelsQueryKey } from '../hooks/useRegistryLabels'
import { getRegistryOccupantsQueryKey } from '../hooks/useRegistryOccupants'
import { getRegistryRoleHistoryForAccountQueryKey } from '../hooks/useRegistryRoleHistoryForAccount'
import {
  invalidateRegistryLabelQueries,
  invalidateRegistryQueries,
} from './invalidateRegistryQueries'

// Keyed through the factories the reads use, so a renamed key fails here.
const keyOf = (factory: { readonly key: string }) =>
  [factory.key, { address: '0x1' }] as const

const ROLE_KEYS = [
  keyOf(getRegistryRootRoleHoldersQueryKey),
  keyOf(getRegistryRoleHistoryForAccountQueryKey),
]

const BIGNAME_KEYS = [
  keyOf(getRegistryInfoQueryKey),
  keyOf(getRegistryLabelsQueryKey),
  keyOf(registryHistoryTimelineQueryKey),
]

const seed = (keys: readonly (readonly unknown[])[]) => {
  const queryClient = new QueryClient()
  for (const key of keys) queryClient.setQueryData(key, [])
  return queryClient
}

describe('registry role invalidation', () => {
  it('refreshes holders, history and registry reads', async () => {
    const untouched = keyOf(getRegistryOccupantsQueryKey)
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS, untouched])
    await invalidateRegistryQueries(queryClient)
    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(untouched)?.isInvalidated).toBe(false)
  })
})

describe('registry label invalidation', () => {
  it('refreshes what a subname created or deleted changes, and not the roles', async () => {
    const labelKeys = [...BIGNAME_KEYS, keyOf(getRegistryOccupantsQueryKey)]
    const queryClient = seed([...labelKeys, ...ROLE_KEYS])
    await invalidateRegistryLabelQueries(queryClient)
    for (const key of labelKeys)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of ROLE_KEYS)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
  })
})
