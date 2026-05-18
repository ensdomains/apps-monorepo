import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
  useParams: () => ({ name: 'irrelevant.eth' }),
}))

const mockAccount = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: mockAccount }),
  }
})

// Stub heavy child components so we can render in isolation and assert only the
// concerns of V2RegistryInfo (header + deploy CTA gating + layout match arm).
vi.mock('@/features/registry/components/RegistryCardsGrid', () => ({
  RegistryCardsGrid: ({
    label,
    contractAddress,
  }: {
    label?: string
    contractAddress?: string
  }) => (
    <div
      data-testid="registry-cards-grid"
      data-label={label}
      data-contract={contractAddress}
    />
  ),
}))

vi.mock('@/features/registry/components/VerifiedRegistryCard', () => ({
  VerifiedRegistryCard: () => <div data-testid="verified-registry-card" />,
}))

vi.mock('@/components/table/NameSubgraphHistory/NameSubgraphHistory', () => ({
  NameSubgraphHistory: () => null,
}))

// Mock useQuery to dispatch on the first segment of the query key.
const nameRegistriesResult: {
  data: unknown
  error: unknown
  isLoading: boolean
} = {
  data: undefined,
  error: undefined,
  isLoading: false,
}
const hasRolesResult: { data: unknown } = { data: true }

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey[0]
      if (key === 'nameRegistries') {
        return nameRegistriesResult
      }
      if (key === 'hasRoles') {
        return hasRolesResult
      }
      return { data: undefined, error: undefined, isLoading: false }
    },
  }
})

const { V2RegistryInfo } = await import('./registry')

const ownerData = {
  owner: '0x1111111111111111111111111111111111111111' as Address,
  registryAddress: '0x1111111111111111111111111111111111111111' as Address,
  protocolVersion: 'ENSv2' as const,
}

const setRegistries = (registries: readonly (Address | null)[] | undefined) => {
  nameRegistriesResult.data = registries
  nameRegistriesResult.error = undefined
  nameRegistriesResult.isLoading = false
}

describe('V2RegistryInfo', () => {
  beforeEach(() => {
    hasRolesResult.data = true
  })

  it('renders the deploy button for a 2LD with a deployed subregistry', () => {
    setRegistries([
      '0x2222222222222222222222222222222222222222' as Address, // foo.eth's subregistry
      '0x1111111111111111111111111111111111111111' as Address, // .eth registry
      '0x0000000000000000000000000000000000000000' as Address, // root
    ])

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    expect(
      screen.getByRole('link', { name: /deploy registry/i }),
    ).toBeInTheDocument()
  })

  it('renders the deploy button for a 3LD without a subregistry (WEB-249)', () => {
    setRegistries([
      zeroAddress, // 1.foo.eth's subregistry — not yet deployed
      '0x2222222222222222222222222222222222222222' as Address, // foo.eth's subregistry (parent)
      '0x1111111111111111111111111111111111111111' as Address, // .eth registry
      '0x0000000000000000000000000000000000000000' as Address, // root
    ])

    render(<V2RegistryInfo name="1.foo.eth" ownerData={ownerData} />)

    expect(
      screen.getByRole('link', { name: /deploy registry/i }),
    ).toBeInTheDocument()
  })

  it('hides the deploy button when the account lacks ROLE_SET_SUBREGISTRY', () => {
    hasRolesResult.data = false
    setRegistries([
      zeroAddress,
      '0x2222222222222222222222222222222222222222' as Address,
      '0x1111111111111111111111111111111111111111' as Address,
      '0x0000000000000000000000000000000000000000' as Address,
    ])

    render(<V2RegistryInfo name="1.foo.eth" ownerData={ownerData} />)

    expect(
      screen.queryByRole('link', { name: /deploy registry/i }),
    ).not.toBeInTheDocument()
  })

  it('renders the 4LD layout and deploy button for a 5-tuple registries shape', () => {
    setRegistries([
      zeroAddress, // x.1.foo.eth's subregistry — not yet deployed
      '0x3333333333333333333333333333333333333333' as Address, // 1.foo.eth's subregistry (parent)
      '0x2222222222222222222222222222222222222222' as Address, // foo.eth's subregistry
      '0x1111111111111111111111111111111111111111' as Address, // .eth registry
      '0x0000000000000000000000000000000000000000' as Address, // root
    ])

    render(<V2RegistryInfo name="x.1.foo.eth" ownerData={ownerData} />)

    expect(
      screen.getByRole('link', { name: /deploy registry/i }),
    ).toBeInTheDocument()

    const grids = screen.getAllByTestId('registry-cards-grid')
    expect(grids).toHaveLength(2)
    expect(grids[0]).toHaveAttribute('data-label', 'x')
    expect(grids[1]).toHaveAttribute('data-label', '1')
    expect(grids[1]).toHaveAttribute(
      'data-contract',
      '0x3333333333333333333333333333333333333333',
    )
  })
})
