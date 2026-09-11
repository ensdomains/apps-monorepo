import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRANT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const CONTROLLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const REGISTRY = '0x1111111111111111111111111111111111111111'

let routeName = 'jobintime.xyz'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: routeName }),
  }),
  // The history timeline's dashboard cards are wrapped at import time.
  createLink: (component: unknown) => component,
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: undefined }),
    // `Owner` resolves a primary name for the address; none here, so the row
    // shows the truncated address.
    useEnsName: () => ({ data: null, error: null, isLoading: false }),
  }
})

// What `resolveEnsOwner` reports, keyed by whichever name the test asks for:
// `null` (no registry entry) unless the test names an owner.
let ownerQuery: { data: unknown; isLoading: boolean; error: unknown } = {
  data: null,
  isLoading: false,
  error: null,
}
const v1StateQuery: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case 'get-ens-owner':
          return ownerQuery
        case 'transfer-v1-name-state':
          return v1StateQuery
        // Availability (a .eth-only query) has nothing to add.
        default:
          return { data: null, isLoading: false, error: null }
      }
    },
  }
})
vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => ({
    isInGrace: false,
    isExpired: false,
    graceEndDate: null,
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/features/renew/hooks/useCanExtend', () => ({
  useCanExtend: () => ({ canExtend: false }),
}))
vi.mock('@/features/transfer/hooks/useCanTransferName', () => ({
  useCanTransferName: () => ({ canTransfer: false }),
}))
vi.mock('@/features/transfer/hooks/useCanTransfer', () => ({
  useCanTransfer: () => false,
}))
vi.mock('@/features/dns-import/components/DnsClaimableMessage', () => ({
  DnsClaimableMessage: ({ name }: { name: string }) => (
    <div data-testid="dns-claimable" data-name={name} />
  ),
}))
vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: () => null,
}))
vi.mock('@/features/profile/components/ExpiryWithRegistrationData', () => ({
  ExpiryWithRegistrationData: () => null,
}))
vi.mock('@/features/profile/components/ParentName', () => ({
  ParentName: () => null,
}))
vi.mock('@/features/ownership/components/ReclaimManagerButton', () => ({
  ReclaimManagerButton: () => null,
}))
vi.mock('@/features/ownership/components/V1NameManagerRecord', () => ({
  V1NameManagerRecord: () => <div data-testid="manager-row" />,
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./index')
const OwnershipRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

beforeEach(() => {
  routeName = 'jobintime.xyz'
  ownerQuery = { data: null, isLoading: false, error: null }
  Object.assign(v1StateQuery, {
    data: undefined,
    isLoading: false,
    isError: false,
  })
})

describe('ownership route', () => {
  // A null owner is no verdict on a DNS name: it may be live off-chain.
  it('hands an ownerless DNS name to the DNS message', () => {
    render(<OwnershipRoute />)

    expect(screen.getByTestId('dns-claimable')).toHaveAttribute(
      'data-name',
      'jobintime.xyz',
    )
    expect(screen.queryByText('Name not registered')).not.toBeInTheDocument()
  })

  it('still reports an ownerless .eth name as not registered', () => {
    routeName = 'nobody.eth'

    render(<OwnershipRoute />)

    expect(screen.getByText('Name not registered')).toBeInTheDocument()
    expect(screen.queryByTestId('dns-claimable')).not.toBeInTheDocument()
  })
})

const ownerRow = () => screen.getByText('Owner').closest('div')?.parentElement

describe('ownership route — Owner row', () => {
  beforeEach(() => {
    routeName = 'alice.eth'
    ownerQuery = {
      // What `resolveEnsOwner` reports for an unwrapped V1 2LD: the registry
      // owner, i.e. the controller.
      data: {
        owner: CONTROLLER,
        registryAddress: REGISTRY,
        protocolVersion: 'ENSv1',
      },
      isLoading: false,
      error: null,
    }
  })

  it('names the registrant, not the controller, for an unwrapped V1 2LD', () => {
    v1StateQuery.data = {
      subject: {
        kind: 'v1-registrar',
        registrant: REGISTRANT,
        controller: CONTROLLER,
      },
      registration: 'active',
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    }

    render(<OwnershipRoute />)

    expect(ownerRow()).toHaveTextContent('0x7099…79C8')
    expect(ownerRow()).not.toHaveTextContent('0xf39F…2266')
    expect(screen.getByTestId('manager-row')).toBeInTheDocument()
  })

  it('names the wrapper owner for a wrapped V1 name', () => {
    v1StateQuery.data = {
      subject: {
        kind: 'v1-wrapped',
        owner: REGISTRANT,
        fuses: {
          cannotTransfer: false,
          cannotSetResolver: false,
          cannotUnwrap: false,
          parentCannotControl: false,
        },
        expiry: null,
      },
      registration: 'active',
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    }

    render(<OwnershipRoute />)

    expect(ownerRow()).toHaveTextContent('0x7099…79C8')
  })

  // In grace the 721 `ownerOf` reverts, so there is no registrant to show; the
  // registry owner is the only trace of who held it.
  it('falls back to the registry owner once the name has lapsed', () => {
    v1StateQuery.data = {
      subject: null,
      registration: 'gracePeriod',
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    }

    render(<OwnershipRoute />)

    expect(ownerRow()).toHaveTextContent('0xf39F…2266')
  })

  it('reports a failed V1 read instead of showing the controller as owner', () => {
    v1StateQuery.isError = true

    render(<OwnershipRoute />)

    expect(screen.getByText('Failed to load owner')).toBeInTheDocument()
    expect(screen.queryByText('0xf39F…2266')).not.toBeInTheDocument()
  })

  it('shows a loading row, not the controller, while the V1 read is in flight', () => {
    v1StateQuery.isLoading = true

    render(<OwnershipRoute />)

    expect(ownerRow()).toHaveTextContent('Loading')
    expect(screen.queryByText('0xf39F…2266')).not.toBeInTheDocument()
  })

  it('uses the resolved owner directly for a V2 name', () => {
    ownerQuery = {
      data: {
        owner: CONTROLLER,
        registryAddress: REGISTRY,
        protocolVersion: 'ENSv2',
      },
      isLoading: false,
      error: null,
    }

    render(<OwnershipRoute />)

    expect(ownerRow()).toHaveTextContent('0xf39F…2266')
    expect(screen.queryByTestId('manager-row')).not.toBeInTheDocument()
  })
})
