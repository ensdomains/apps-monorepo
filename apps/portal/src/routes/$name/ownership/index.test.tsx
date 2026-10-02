import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  return { ...actual, useConnection: () => ({ address: undefined }) }
})

// What `resolveEnsOwner` reports: `null` (no registry entry) unless the test
// names an owner.
let ownerQuery: { data: unknown; isLoading: boolean; error: unknown } = {
  data: null,
  isLoading: false,
  error: null,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      options.queryKey[0] === 'get-ens-owner'
        ? ownerQuery
        : // Availability (a .eth-only query) has nothing to add.
          { data: null, isLoading: false, error: null },
  }
})
let isInGrace = false
vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => ({
    isInGrace,
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

// The row's own V1-vs-V2 behaviour is covered in NameOwnerRow.test.tsx; this
// route only has to hand it the name and the protocol it resolved.
vi.mock('@/features/ownership/components/NameOwnerRow', () => ({
  NameOwnerRow: ({
    badge,
    ...props
  }: Record<string, unknown> & { badge?: React.ReactNode }) => (
    <div>
      <div data-testid="owner-row">{JSON.stringify(props)}</div>
      {badge}
    </div>
  ),
}))
vi.mock('@/features/roles/components/PrivilegeWarnings', () => ({
  TransferPrivilegeWarning: ({
    name,
    ownerData,
  }: {
    name: string
    ownerData: { owner: string }
  }) => (
    <div
      data-testid="transfer-warning"
      data-name={name}
      data-owner={ownerData.owner}
    />
  ),
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./index')
const OwnershipRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

beforeEach(() => {
  routeName = 'jobintime.xyz'
  isInGrace = false
  ownerQuery = { data: null, isLoading: false, error: null }
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

describe('ownership route — Owner row', () => {
  const resolveAs = (protocolVersion: 'ENSv1' | 'ENSv2') => {
    routeName = 'alice.eth'
    ownerQuery = {
      // `resolveEnsOwner` reports the controller for an unwrapped 2LD.
      data: { owner: CONTROLLER, registryAddress: REGISTRY, protocolVersion },
      isLoading: false,
      error: null,
    }
  }

  it('delegates the V1 owner row to the shared component', () => {
    resolveAs('ENSv1')

    render(<OwnershipRoute />)

    expect(screen.getByTestId('owner-row')).toHaveTextContent(
      JSON.stringify({
        name: 'alice.eth',
        label: 'Owner',
        owner: CONTROLLER,
        protocolVersion: 'ENSv1',
      }),
    )
    expect(screen.getByTestId('manager-row')).toBeInTheDocument()
  })

  it('passes the resolved owner through for a V2 name', () => {
    resolveAs('ENSv2')

    render(<OwnershipRoute />)

    expect(screen.getByTestId('owner-row')).toHaveTextContent(
      JSON.stringify({
        name: 'alice.eth',
        label: 'Owner',
        owner: CONTROLLER,
        protocolVersion: 'ENSv2',
      }),
    )
    expect(screen.queryByTestId('manager-row')).not.toBeInTheDocument()
  })

  it('flags missing transfer privileges beside the owner', () => {
    resolveAs('ENSv2')

    render(<OwnershipRoute />)

    const warning = screen.getByTestId('transfer-warning')
    expect(warning).toHaveAttribute('data-name', 'alice.eth')
    expect(warning).toHaveAttribute('data-owner', CONTROLLER)
  })

  it('leaves the warning off a name in grace', () => {
    resolveAs('ENSv2')
    isInGrace = true

    render(<OwnershipRoute />)

    expect(screen.queryByTestId('transfer-warning')).not.toBeInTheDocument()
  })
})
