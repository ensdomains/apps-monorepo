import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { getRegistryHistoryQueryOptions } from '../components/v2/RegistryHistory'
import { getRegistryInfoQueryOptions } from '../hooks/useRegistry'
import { getRegistryLabelsQueryOptions } from '../hooks/useRegistryLabels'
import { getRegistryOccupantsQueryOptions } from '../hooks/useRegistryOccupants'
import { getRegistryRoleHistoryForAccountQueryOptions } from '../hooks/useRegistryRoleHistoryForAccount'
import {
  invalidateRegistryLabelQueries,
  invalidateRegistryQueries,
} from './invalidateRegistryQueries'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0x2222222222222222222222222222222222222222'

// Keys from the options the reads use, so a key renamed on one side fails here.
const ROLE_KEYS = [
  getRegistryRootRoleHoldersQueryOptions({ registryAddress: REGISTRY })
    .queryKey,
  getRegistryRoleHistoryForAccountQueryOptions({
    registryAddress: REGISTRY,
    account: ACCOUNT,
  }).queryKey,
]

const BIGNAME_KEYS = [
  getRegistryInfoQueryOptions({ address: REGISTRY }).queryKey,
  getRegistryLabelsQueryOptions({ address: REGISTRY }).queryKey,
  getRegistryHistoryQueryOptions({ address: REGISTRY }).queryKey,
]

const OCCUPANTS_KEY = getRegistryOccupantsQueryOptions({
  address: REGISTRY,
  account: ACCOUNT,
}).queryKey

const seed = (keys: readonly (readonly unknown[])[]) => {
  const queryClient = new QueryClient()
  for (const key of keys) queryClient.setQueryData(key, [])
  return queryClient
}

describe('registry role invalidation', () => {
  it('refreshes holders, history and registry reads', async () => {
    const untouched = OCCUPANTS_KEY
    const queryClient = seed([...ROLE_KEYS, ...BIGNAME_KEYS, untouched])
    await invalidateRegistryQueries(queryClient)
    for (const key of [...ROLE_KEYS, ...BIGNAME_KEYS])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(untouched)?.isInvalidated).toBe(false)
  })
})

describe('registry label invalidation', () => {
  it('refreshes what a subname created or deleted changes, and not the roles', async () => {
    const labelKeys = [...BIGNAME_KEYS, OCCUPANTS_KEY]
    const queryClient = seed([...labelKeys, ...ROLE_KEYS])
    await invalidateRegistryLabelQueries(queryClient)
    for (const key of labelKeys)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of ROLE_KEYS)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
  })
})
