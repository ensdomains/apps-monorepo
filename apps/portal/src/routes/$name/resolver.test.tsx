import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let routeName = 'jobintime.xyz'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => options,
  useParams: () => ({ name: routeName }),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({
      address: '0x55e55C649895940826a852820d9e1A076Ec47b09',
    }),
  }
})

type QueryResult = {
  data: unknown
  error: unknown
  isLoading: boolean
  isSuccess: boolean
}
const settled = (data: unknown): QueryResult => ({
  data,
  error: null,
  isLoading: false,
  isSuccess: true,
})
let ownerResult: QueryResult
let resolverResult: QueryResult
let v1StateResult: QueryResult

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueries: () => [ownerResult, resolverResult],
    // Roles are granted unconditionally, so a missing "Change resolver" button
    // on a V2 name can only mean the route found no registry entry. A V1 name
    // never consults them: its authority is the registry slot, which comes
    // from the V1 name state below.
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey[0]
      if (key === 'hasRoles') return settled(true)
      if (key === 'get-ens-owner') return ownerResult
      if (key === 'transfer-v1-name-state') return v1StateResult
      return settled(undefined)
    },
  }
})

type Offchain = { isLoading: boolean; resolvedAddress: string | null }
let offchain: Offchain
vi.mock('@/features/dns-import/hooks/useDnsOffchainName', () => ({
  useDnsOffchainName: () => offchain,
}))
vi.mock('@/features/dns-import/components/DnsClaimableMessage', () => ({
  DnsClaimableMessage: ({ name }: { name: string }) => (
    <div data-testid="dns-claimable" data-name={name} />
  ),
}))
// Leaf components with their own router/wagmi needs, covered by their tests.
vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: () => null,
}))
vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./resolver')
const ResolverRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

// contracts-v2's ENSV1Resolver on Sepolia: the v2 UniversalResolver's
// fallback for every name that only exists in v1 — which is every DNS name,
// imported or not.
const ENS_V1_RESOLVER = '0xae66c62AcAE72098BdAc57d8E8AED53EF000b2Ba'

beforeEach(() => {
  routeName = 'jobintime.xyz'
  ownerResult = settled(null)
  resolverResult = settled(ENS_V1_RESOLVER)
  // No registry entry by default — the gasless DNS name the first case covers.
  v1StateResult = settled({ subject: null })
  offchain = { isLoading: false, resolvedAddress: null }
})

describe('resolver route', () => {
  // jobintime.xyz on Sepolia: ENS1 record, no registry entry, resolves fine.
  it('shows the resolver of a gasless DNS name, read-only', () => {
    offchain = {
      isLoading: false,
      resolvedAddress: '0x55e55C649895940826a852820d9e1A076Ec47b09',
    }

    render(<ResolverRoute />)

    expect(screen.getByText(ENS_V1_RESOLVER)).toBeInTheDocument()
    expect(screen.queryByText('Change resolver')).not.toBeInTheDocument()
    expect(screen.queryByText('Name not registered')).not.toBeInTheDocument()
  })

  it('hands an unimported DNS name to the DNS message', () => {
    routeName = 'google.com'

    render(<ResolverRoute />)

    expect(screen.getByTestId('dns-claimable')).toHaveAttribute(
      'data-name',
      'google.com',
    )
    expect(screen.queryByText(ENS_V1_RESOLVER)).not.toBeInTheDocument()
  })

  it('still reports an ownerless .eth name as not registered', () => {
    routeName = 'nobody.eth'

    render(<ResolverRoute />)

    expect(screen.getByText('Name not registered')).toBeInTheDocument()
    expect(screen.queryByTestId('dns-claimable')).not.toBeInTheDocument()
  })

  it('keeps the Change resolver button for a name with a registry entry', () => {
    routeName = 'v1rtl.site'
    ownerResult = settled({
      owner: '0x55e55C649895940826a852820d9e1A076Ec47b09',
      registryAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      protocolVersion: 'ENSv1',
    })
    v1StateResult = settled({
      subject: {
        kind: 'v1-registry',
        owner: '0x55e55C649895940826a852820d9e1A076Ec47b09',
      },
    })

    render(<ResolverRoute />)

    expect(screen.getByText('Change resolver')).toBeInTheDocument()
    expect(screen.getByText(ENS_V1_RESOLVER)).toBeInTheDocument()
  })

  it('hides it from someone who does not hold the V1 registry slot', () => {
    routeName = 'v1rtl.site'
    ownerResult = settled({
      owner: '0x55e55C649895940826a852820d9e1A076Ec47b09',
      registryAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      protocolVersion: 'ENSv1',
    })
    v1StateResult = settled({
      subject: {
        kind: 'v1-registry',
        owner: '0x1111111111111111111111111111111111111111',
      },
    })

    render(<ResolverRoute />)

    expect(screen.queryByText('Change resolver')).not.toBeInTheDocument()
  })
})
