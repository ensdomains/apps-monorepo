import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { NameRegistryRolesOverviewTable } from './NameRegistryRolesOverviewTable'

const OWN_REGISTRY = '0x1111111111111111111111111111111111110001' as Address
const PARENT_REGISTRY = '0x1111111111111111111111111111111111110002' as Address
const ROOT_REGISTRY = '0x1111111111111111111111111111111111110003' as Address

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[0] === 'nameRegistries'
      ? {
          data: [OWN_REGISTRY, PARENT_REGISTRY, ROOT_REGISTRY],
          isLoading: false,
          error: null,
        }
      : { data: undefined, isLoading: false, error: null },
}))

vi.mock('@/features/roles/components/RoleContractGate', () => ({
  RoleContractGate: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/features/registry/components/v2/RegistryRolesTable', () => ({
  RegistryRolesTable: () => null,
}))

describe('NameRegistryRolesOverviewTable', () => {
  it("shows the name's own registry address, not its parent's", () => {
    render(<NameRegistryRolesOverviewTable name="sub.elephant.eth" />)

    expect(screen.getByText(truncateAddress(OWN_REGISTRY))).toBeInTheDocument()
    expect(
      screen.queryByText(truncateAddress(PARENT_REGISTRY)),
    ).not.toBeInTheDocument()
  })
})
