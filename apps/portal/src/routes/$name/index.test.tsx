import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils'

const CONTROLLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const REGISTRY = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x2222222222222222222222222222222222222222'

let protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv1'
let isInGrace = false

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useParams: () => ({ name: 'alice.eth' }),
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => ({}),
    }),
  }
})

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: undefined }),
    useEnsResolver: () => ({
      data: RESOLVER,
      isLoading: false,
      error: null,
    }),
  }
})

vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => ({
    isInGrace,
    isExpired: isInGrace,
    graceEndDate: isInGrace ? new Date('2030-01-01') : null,
  }),
}))
vi.mock('@/features/renew/hooks/useCanExtend', () => ({
  useCanExtend: () => ({ canExtend: false, isLoading: false }),
}))
vi.mock('@/features/migration/hooks/useMigrationStatus', () => ({
  getMigrationStatusQueryOptions: () => ({
    queryKey: ['get-migration-status'],
    queryFn: () => null,
    enabled: false,
  }),
  useMigrationStatus: () => ({
    data: undefined,
    isLoading: false,
    isMigratableByConnectedOwner: false,
  }),
}))

// Everything else in the header list is covered by its own tests; this route
// only has to hand the Owner row the name and the protocol it resolved.
vi.mock('@/features/profile/components/ExpiryWithRegistrationData', () => ({
  ExpiryWithRegistrationData: () => null,
}))
vi.mock('@/features/profile/components/ParentName', () => ({
  ParentName: () => null,
}))
vi.mock('@/features/profile/components/NameProfileCard', () => ({
  NameProfileCard: () => null,
}))
vi.mock('@/features/profile/components/ResolverCard', () => ({
  ResolverCard: () => null,
}))
vi.mock('@/features/profile/components/RegistryCard', () => ({
  RegistryCard: () => null,
}))
vi.mock('@/features/profile/components/ProtocolRow', () => ({
  ProtocolRow: ({ migration }: { migration?: unknown }) => (
    <div data-testid="protocol-row">{JSON.stringify(migration)}</div>
  ),
}))
vi.mock('@/features/profile/components/SubnameCount', () => ({
  SubnameCount: () => null,
}))
vi.mock('@/features/profile/components/ProtocolVersionWithCounter', () => ({
  ProtocolVersionWithCounter: () => null,
}))
vi.mock('@/features/profile/components/RecordCount', () => ({
  RecordCount: () => null,
}))
vi.mock('@/features/profile/components/GraceBanner', () => ({
  GraceBanner: () => null,
}))
vi.mock('@/features/history/components/RecentHistoryTimeline', () => ({
  RecentHistoryTimeline: () => null,
}))
vi.mock('@/features/renew/components/ExtendNameButton', () => ({
  ExtendNameButton: () => null,
}))

// The row's own V1-vs-V2 behaviour is covered in NameOwnerRow.test.tsx.
vi.mock('@/features/ownership/components/NameOwnerRow', () => ({
  NameOwnerRow: (props: Record<string, unknown>) => (
    <div data-testid="owner-row">{JSON.stringify(props)}</div>
  ),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case 'get-ens-owner':
          return {
            // `resolveEnsOwner` reports the controller for an unwrapped 2LD.
            data: {
              owner: CONTROLLER,
              registryAddress: REGISTRY,
              protocolVersion,
            },
            isLoading: false,
            error: null,
          }
        case 'get-migration-status':
          return {
            data: { migratable: false },
            isLoading: false,
            error: null,
          }
        case 'check-name-availability':
          return {
            data: { isAvailable: false },
            isLoading: false,
            error: null,
          }
        default:
          return { data: undefined, isLoading: false, error: null }
      }
    },
  }
})

// See the note in ./ownership/index.test.tsx — `Route` is the mocked options object.
const { Route } = await import('./index')
const NameRoute = (Route as unknown as { component: () => React.ReactElement })
  .component

// `useQuery` is stubbed above, but the page still reaches the real client for
// invalidation (the DNS sync refresh), so it needs a provider like it has in
// the app.
const renderRoute = () =>
  render(<NameRoute />, { wrapper: createTestWrapper() })

describe('name route — Owner row', () => {
  // WEB-1468: this page and the ownership page must not name different
  // addresses for the same V1 name, so both go through NameOwnerRow.
  it('delegates the V1 owner row to the shared component', () => {
    protocolVersion = 'ENSv1'

    renderRoute()

    expect(screen.getByTestId('owner-row')).toHaveTextContent(
      JSON.stringify({
        name: 'alice.eth',
        owner: CONTROLLER,
        protocolVersion: 'ENSv1',
        label: 'Owner',
      }),
    )
  })

  it('passes the resolved owner through for a V2 name', () => {
    protocolVersion = 'ENSv2'

    renderRoute()

    expect(screen.getByTestId('owner-row')).toHaveTextContent(
      JSON.stringify({
        name: 'alice.eth',
        owner: CONTROLLER,
        protocolVersion: 'ENSv2',
        label: 'Owner',
      }),
    )
  })

  it('labels the row "Previous owner" while the name is in grace', () => {
    protocolVersion = 'ENSv1'
    isInGrace = true

    renderRoute()

    expect(screen.getByTestId('owner-row')).toHaveTextContent(
      '"label":"Previous owner"',
    )

    isInGrace = false
  })
})

describe('name route — Protocol row', () => {
  // The verdict is about the name, so a visitor who cannot migrate it still
  // sees "Cannot be migrated" rather than a bare protocol version.
  it('hands the row the name-scoped migration verdict', () => {
    protocolVersion = 'ENSv1'

    renderRoute()

    expect(screen.getByTestId('protocol-row')).toHaveTextContent(
      JSON.stringify({ migratable: false }),
    )
  })
})
