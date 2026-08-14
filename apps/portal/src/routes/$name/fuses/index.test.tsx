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
let wrapperDataResult: QueryResult

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      options.queryKey[0] === 'get-wrapper-data'
        ? wrapperDataResult
        : { data: undefined, error: undefined, isLoading: false },
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
    expect(screen.getByRole('heading', { name: 'Fuses' })).toBeInTheDocument()
    expect(screen.getByText('Parent Cannot Control')).toBeInTheDocument()
  })

  it('hides the burn CTA once the name has dropped out of grace', () => {
    graceStatus = { ...ACTIVE_GRACE, isExpired: true }

    render(<FusesRoute />)

    expect(screen.queryByText('Burn fuses')).not.toBeInTheDocument()
    // No banner past grace — its "ends on <date>" copy would be wrong.
    expect(screen.queryByText('This name has expired')).not.toBeInTheDocument()
  })
})
