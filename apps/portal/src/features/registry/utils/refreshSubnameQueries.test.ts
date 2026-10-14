import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { getAddressNamesQueryOptions } from '@/features/dashboard/hooks/useAddressNames'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { refreshSubnameQueries } from './refreshSubnameQueries'

vi.mock('@/utils/query/pollForIndexerSync', () => ({
  pollForIndexerSync: ({
    invalidateQueries,
  }: {
    readonly invalidateQueries: () => Promise<void>
  }) => invalidateQueries(),
}))

const ADDRESS: Address = '0x1111111111111111111111111111111111111111'

describe('refreshSubnameQueries', () => {
  it('refreshes the address names lists once indexed, and not the roles', async () => {
    const names = getAddressNamesQueryOptions({ address: ADDRESS }).queryKey
    const roles = getRegistryRootRoleHoldersQueryOptions({
      registryAddress: ADDRESS,
    }).queryKey
    const queryClient = new QueryClient()
    const keys: readonly (readonly unknown[])[] = [names, roles]
    for (const key of keys) queryClient.setQueryData(key, [])

    refreshSubnameQueries(queryClient, {
      name: 'parent.eth',
      protocolVersion: 'ENSv2',
    })

    await vi.waitFor(() =>
      expect(queryClient.getQueryState(names)?.isInvalidated).toBe(true),
    )
    expect(queryClient.getQueryState(roles)?.isInvalidated).toBe(false)
  })
})
