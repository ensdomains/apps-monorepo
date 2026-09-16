import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const NAME = 'l2eth.eth'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: NAME }),
  }),
}))

const OWNER = '0x55e55c649895940826a852820d9e1a076ec47b09'
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useConnection: () => ({ address: OWNER }) }
})

// Swapped wholesale per test (see the note in ./burn.test.tsx) so no case can
// leak a stray field into the next one.
type GraceStatus = {
  isInGrace: boolean
  isExpired: boolean
  graceEndDate: Date | null
  isLoading: boolean
  error: Error | null
}
const ACTIVE_GRACE: GraceStatus = {
  isInGrace: false,
  isExpired: false,
  graceEndDate: null,
  isLoading: false,
  error: null,
}
let graceStatus: GraceStatus = ACTIVE_GRACE
vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => graceStatus,
}))
vi.mock('@/features/renew/hooks/useCanExtend', () => ({
  useCanExtend: () => ({ canExtend: true }),
}))

type QueryResult = { data: unknown; error: unknown; isLoading: boolean }
const SETTLED_EMPTY: QueryResult = {
  data: undefined,
  error: undefined,
  isLoading: false,
}
let wrapperDataResult: QueryResult
let ownerResult: QueryResult
let migrationResult: QueryResult

type QueryOptions = { queryKey: readonly unknown[] }
const resultFor = ({ queryKey }: QueryOptions): QueryResult => {
  switch (queryKey[0]) {
    case 'get-wrapper-data':
      return wrapperDataResult
    case 'get-ens-owner':
      return ownerResult
    case 'get-migration-status':
      return migrationResult
    default:
      return SETTLED_EMPTY
  }
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: resultFor,
    useQueries: ({ queries }: { queries: QueryOptions[] }) =>
      queries.map(resultFor),
  }
})

// See the note in ./burn.test.tsx — `Route` is the mocked options object.
const { Route } = await import('./index')
const FusesRoute = (Route as unknown as { component: () => React.ReactElement })
  .component

const wrapperData = {
  owner: OWNER,
  expiry: 1787852628n,
  fuses: {
    parent: { PARENT_CANNOT_CONTROL: true, IS_DOT_ETH: true },
    child: {
      CANNOT_UNWRAP: false,
      CANNOT_BURN_FUSES: false,
      CANNOT_TRANSFER: false,
      CANNOT_SET_RESOLVER: false,
      CANNOT_SET_TTL: false,
      CANNOT_CREATE_SUBDOMAIN: false,
      CANNOT_APPROVE: false,
    },
  },
}

beforeEach(() => {
  wrapperDataResult = { data: wrapperData, error: undefined, isLoading: false }
  ownerResult = { ...SETTLED_EMPTY, data: { protocolVersion: 'ENSv1' } }
  migrationResult = SETTLED_EMPTY
  graceStatus = ACTIVE_GRACE
})

describe('fuses index route', () => {
  it('offers the burn CTA to the owner of an active name', () => {
    render(<FusesRoute />)

    expect(screen.getByText('Burn fuses')).toBeInTheDocument()
    expect(screen.queryByText('This name has expired')).not.toBeInTheDocument()
  })

  it('hides the burn CTA and explains why while the name is in grace', () => {
    graceStatus = {
      ...ACTIVE_GRACE,
      isInGrace: true,
      isExpired: true,
      graceEndDate: new Date('2026-08-27T17:43:48Z'),
    }

    render(<FusesRoute />)

    expect(screen.queryByText('Burn fuses')).not.toBeInTheDocument()
    expect(screen.getByText('This name has expired')).toBeInTheDocument()
    // The read-only view stays: fuse state is still worth seeing.
    expect(
      screen.getByRole('heading', { name: `${NAME} Fuses` }),
    ).toBeInTheDocument()
    expect(screen.getByText('Parent Cannot Control')).toBeInTheDocument()
  })

  // Matches ./burn.tsx: a failed lookup reads as `isExpired: false`, so both
  // routes fail closed on it — and this one says why, since a silently missing
  // button leaves the owner of a healthy name with nothing to act on.
  it('hides the burn CTA and explains when the expiry lookup errors', () => {
    graceStatus = { ...ACTIVE_GRACE, error: new Error('rpc unavailable') }

    render(<FusesRoute />)

    expect(screen.queryByText('Burn fuses')).not.toBeInTheDocument()
    expect(screen.getByText(/Couldn't check whether this name/)).toBeVisible()
    // The fuse table is unaffected by a failed expiry lookup.
    expect(screen.getByText('Parent Cannot Control')).toBeInTheDocument()
  })

  it('hides the burn CTA once the name has dropped out of grace', () => {
    graceStatus = { ...ACTIVE_GRACE, isExpired: true }

    render(<FusesRoute />)

    expect(screen.queryByText('Burn fuses')).not.toBeInTheDocument()
    // No banner past grace — its "ends on <date>" copy would be wrong.
    expect(screen.queryByText('This name has expired')).not.toBeInTheDocument()
  })

  // `isV1Name` picks the message a fuseless name gets, so reading it before
  // the owner query settles would show the v2 copy to a v1 name.
  it('waits for the owner lookup before picking a message', () => {
    wrapperDataResult = SETTLED_EMPTY
    ownerResult = { ...SETTLED_EMPTY, isLoading: true }

    render(<FusesRoute />)

    expect(screen.getByText('Surfacing everything you need.')).toBeVisible()
    expect(
      screen.queryByText(/Fuses are only available for wrapped ENSv1 names/),
    ).not.toBeInTheDocument()
  })

  it('surfaces a failed owner lookup instead of guessing the message', () => {
    wrapperDataResult = SETTLED_EMPTY
    ownerResult = { ...SETTLED_EMPTY, error: new Error('rpc unavailable') }

    render(<FusesRoute />)

    expect(screen.getByText('Failed to load name')).toBeVisible()
    expect(
      screen.queryByText(/Fuses are only available for wrapped ENSv1 names/),
    ).not.toBeInTheDocument()
  })

  it('points an unwrapped v1 name at Roles rather than the v2 message', () => {
    wrapperDataResult = SETTLED_EMPTY

    render(<FusesRoute />)

    expect(
      screen.getByText(/This name is not wrapped, so it has no fuses/),
    ).toBeVisible()
    expect(
      screen.queryByText(/Fuses are only available for wrapped ENSv1 names/),
    ).not.toBeInTheDocument()
  })

  it('offers the migrate banner only to the holder of a wrapped v1 name', () => {
    render(<FusesRoute />)
    expect(screen.queryByText('Upgrade to v2')).not.toBeInTheDocument()

    migrationResult = {
      ...SETTLED_EMPTY,
      data: { migratable: true, tokenHolder: OWNER },
    }
    render(<FusesRoute />)

    expect(screen.getByText('Upgrade to v2')).toBeVisible()
  })
})
