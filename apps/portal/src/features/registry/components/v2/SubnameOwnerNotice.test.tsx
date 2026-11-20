import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'
import { SubnameOwnerNotice } from './SubnameOwnerNotice'

const OWNER: Address = '0x00000000000000000000000000000000000000a1'
const OUTDATED: Address = '0x00000000000000000000000000000000000000b1'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: OWNER }),
}))

vi.mock('@/features/registry/queries/getIsRegistryPendingUpgrade', () => ({
  getIsRegistryPendingUpgradeQueryOptions: ({
    registryAddress,
  }: {
    readonly registryAddress: Address
  }) => ({
    queryKey: ['pendingUpgrade', registryAddress],
    queryFn: async () => registryAddress === OUTDATED,
  }),
}))

vi.mock('@/features/registry/hooks/useHasSetSubregistryRole', () => ({
  useHasSetSubregistryRole: (name: string) => ({
    hasRole: name === 'sub.jooooe.eth',
    isLoading: false,
  }),
}))

describe('SubnameOwnerNotice', () => {
  it("names the parent when the owner's subname sits in an outdated registry", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SubnameOwnerNotice
          name="sub.jooooe.eth"
          owner={OWNER}
          registryAddress={OUTDATED}
          protocolVersion="ENSv2"
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Upgrade required')).toBeInTheDocument()
    expect(screen.getByText('jooooe.eth')).toBeInTheDocument()
  })
})
