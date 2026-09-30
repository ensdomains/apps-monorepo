import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils'

const CONTROLLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const REGISTRY = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x2222222222222222222222222222222222222222'

let protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv1'
let isInGrace = false
let migrationStatus: {
  isMigratableByConnectedOwner: boolean
  isWrapped: boolean
} = { isMigratableByConnectedOwner: false, isWrapped: false }
// Stands in for the router's location: `search` is whatever the URL carries,
// `state` is history state, which only the app's own navigate can write.
let location: {
  search: Record<string, unknown>
  state: Record<string, unknown>
} = { search: {}, state: {} }

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useParams: () => ({ name: 'alice.eth' }),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: typeof location }) => unknown
    }) => select({ location }),
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      // Run the route's own `validateSearch` the way the router would, so a
      // crafted URL reaches the component exactly as it would in the browser.
      useSearch: () =>
        typeof options.validateSearch === 'function'
          ? (options.validateSearch as (search: unknown) => unknown)(
              location.search,
            )
          : location.search,
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
  useMigrationStatus: () => migrationStatus,
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
  ProtocolRow: ({ protocolVersion }: { protocolVersion: string }) => (
    <div data-testid="protocol-row">{protocolVersion}</div>
  ),
  V1ProtocolRow: ({ name }: { name: string }) => (
    <div data-testid="v1-protocol-row">{name}</div>
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
  // The V1 row decides for itself whether the viewer owns the name and so
  // gets the migration verdict; see ProtocolRow.test.tsx.
  it('renders the V1 row, which owns the migration verdict, for a V1 name', () => {
    protocolVersion = 'ENSv1'

    renderRoute()

    expect(screen.getByTestId('v1-protocol-row')).toHaveTextContent('alice.eth')
    expect(screen.queryByTestId('protocol-row')).not.toBeInTheDocument()
  })

  it('renders the plain row for a V2 name', () => {
    protocolVersion = 'ENSv2'

    renderRoute()

    expect(screen.getByTestId('protocol-row')).toHaveTextContent('ENSv2')
    expect(screen.queryByTestId('v1-protocol-row')).not.toBeInTheDocument()
  })
})

describe('name route — upgrade banner', () => {
  afterEach(() => {
    migrationStatus = { isMigratableByConnectedOwner: false, isWrapped: false }
  })

  const holderMigration = (isWrapped: boolean) => ({
    isMigratableByConnectedOwner: true,
    isWrapped,
  })

  it('tells the holder of an unlocked wrapped name it is unwrapped on the way', () => {
    protocolVersion = 'ENSv1'
    migrationStatus = holderMigration(true)

    renderRoute()

    expect(screen.getByText(/must be unwrapped before/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Unwrap and upgrade/ }),
    ).toBeInTheDocument()
  })

  // Locked names migrate still wrapped, so they get the plain upgrade copy.
  it('offers a plain upgrade for a locked wrapped name', () => {
    protocolVersion = 'ENSv1'
    migrationStatus = holderMigration(false)

    renderRoute()

    expect(screen.getByText(/reserved on ENS v2/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Upgrade to v2/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/must be unwrapped/)).not.toBeInTheDocument()
  })
})

// Immunefi #92544 (WEB-1490): the banner says "You are the owner of {name}" and
// prints the paid figure verbatim, so it must never be reachable from a link.
describe('name route — registration success banner', () => {
  afterEach(() => {
    location = { search: {}, state: {} }
  })

  it('ignores a crafted URL claiming a registration', () => {
    location = {
      search: {
        registered: 'true',
        duration: 315360000,
        paid: '$0.00 (free)',
      },
      state: {},
    }

    renderRoute()

    expect(screen.queryByText('Congratulations!')).toBeNull()
    expect(screen.queryByText(/You are the owner of/)).toBeNull()
    expect(screen.queryByText('$0.00 (free)')).toBeNull()
  })

  it('renders after a registration this session performed', () => {
    location = {
      search: {},
      state: {
        registrationSuccess: { durationSeconds: 31536000, paid: '$5.00' },
      },
    }

    renderRoute()

    expect(screen.getByText('Congratulations!')).toBeInTheDocument()
    expect(
      screen.getByText('You are the owner of alice.eth'),
    ).toBeInTheDocument()
    expect(screen.getByText('$5.00')).toBeInTheDocument()
  })
})
