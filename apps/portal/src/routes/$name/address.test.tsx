import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let routeName = 'jobintime.xyz'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: routeName }),
  }),
}))

type QueryResult = {
  data: unknown
  error: unknown
  isLoading: boolean
  isSuccess: boolean
}
const settled = (data: unknown): QueryResult => ({
  data,
  error: undefined,
  isLoading: false,
  isSuccess: true,
})
let ownerResult: QueryResult
let profileResult: QueryResult

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey[0]
      if (key === 'get-ens-owner') return ownerResult
      if (key === 'profile') return profileResult
      return settled(undefined)
    },
  }
})

type Offchain = { isLoading: boolean; resolvedAddress: string | null }
let offchain: Offchain
const useDnsOffchainNameMock = vi.fn(
  (_params: { name: string; owner: unknown }) => offchain,
)
vi.mock('@/features/dns-import/hooks/useDnsOffchainName', () => ({
  useDnsOffchainName: (params: { name: string; owner: unknown }) =>
    useDnsOffchainNameMock(params),
}))
vi.mock('@/features/dns-import/components/DnsClaimableMessage', () => ({
  DnsClaimableMessage: ({ name }: { name: string }) => (
    <div data-testid="dns-claimable" data-name={name} />
  ),
}))
vi.mock('@/features/records/hooks/useNameResolverAddress', () => ({
  useNameResolverAddress: () => ({ data: undefined }),
}))
// The table's own rendering is covered elsewhere; these tests only care
// whether the route reaches it, and with which rows.
vi.mock(
  '@/features/forward-resolution/components/AddressResolution/AddressResolutionTable',
  () => ({
    AddressResolutionTable: ({
      table,
    }: {
      table: {
        getRowModel: () => {
          rows: { original: { label: string; address: string | null } }[]
        }
      }
    }) => (
      <ul data-testid="address-table">
        {table.getRowModel().rows.map(({ original }) => (
          <li key={original.label}>
            {original.label}: {original.address ?? '—'}
          </li>
        ))}
      </ul>
    ),
  }),
)

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./address')
const AddressRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

const RESOLVED = '0x55e55C649895940826a852820d9e1A076Ec47b09'
const profileWithEthAddress = {
  records: { coins: [{ coinType: 60, symbol: 'eth', value: RESOLVED }] },
  subgraphRecords: {},
}

beforeEach(() => {
  routeName = 'jobintime.xyz'
  ownerResult = settled(null)
  profileResult = settled(profileWithEthAddress)
  offchain = { isLoading: false, resolvedAddress: null }
  useDnsOffchainNameMock.mockClear()
})

describe('address route', () => {
  // jobintime.xyz on Sepolia: ENS1 record, no registry entry, resolves fine.
  it('shows the resolved addresses of a gasless DNS name', () => {
    offchain = { isLoading: false, resolvedAddress: RESOLVED }

    render(<AddressRoute />)

    expect(screen.getByTestId('address-table')).toHaveTextContent(RESOLVED)
    expect(screen.queryByText('Name not registered')).not.toBeInTheDocument()
    expect(useDnsOffchainNameMock).toHaveBeenLastCalledWith({
      name: 'jobintime.xyz',
      owner: null,
    })
  })

  it('waits for the off-chain check before deciding', () => {
    offchain = { isLoading: true, resolvedAddress: null }

    render(<AddressRoute />)

    expect(screen.queryByTestId('address-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dns-claimable')).not.toBeInTheDocument()
    expect(screen.queryByText('Name not registered')).not.toBeInTheDocument()
  })

  it('hands an unimported DNS name to the DNS message', () => {
    routeName = 'google.com'
    profileResult = settled({ records: { coins: [] }, subgraphRecords: {} })

    render(<AddressRoute />)

    expect(screen.getByTestId('dns-claimable')).toHaveAttribute(
      'data-name',
      'google.com',
    )
    expect(screen.queryByTestId('address-table')).not.toBeInTheDocument()
  })

  it('still reports an ownerless .eth name as not registered', () => {
    routeName = 'nobody.eth'
    profileResult = settled({ records: { coins: [] }, subgraphRecords: {} })

    render(<AddressRoute />)

    expect(screen.getByText('Name not registered')).toBeInTheDocument()
    expect(screen.queryByTestId('dns-claimable')).not.toBeInTheDocument()
  })

  // The hook skips the lookup itself when there is an owner (see its tests).
  it('shows the addresses of a name with a registry entry', () => {
    const ownerData = {
      owner: RESOLVED,
      registryAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      protocolVersion: 'ENSv1',
    }
    ownerResult = settled(ownerData)

    render(<AddressRoute />)

    expect(screen.getByTestId('address-table')).toHaveTextContent(RESOLVED)
    expect(useDnsOffchainNameMock).toHaveBeenLastCalledWith({
      name: 'jobintime.xyz',
      owner: ownerData,
    })
  })
})
