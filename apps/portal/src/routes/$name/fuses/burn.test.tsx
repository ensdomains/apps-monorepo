import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route reads its own params, so `createFileRoute` has to hand back an
// object that carries both the component and a `useParams` — the route module
// calls `Route.useParams()` from inside the component it defines.
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
  return {
    ...actual,
    useConnection: () => ({ address: OWNER }),
    useWalletClient: () => ({ data: { account: { address: OWNER } } }),
    usePublicClient: () => ({}),
  }
})

// The wallet/chain plumbing behind the submit path is irrelevant to the gating
// assertions, and pulls in the wagmi config + transaction manager.
vi.mock('@/lib/wagmi', () => ({ sepoliaWithEns: { id: 11155111 } }))
vi.mock('@/features/fuses/helpers/burnFuses', () => ({
  burnFuses: vi.fn(),
  prepareBurnFusesTransaction: vi.fn(),
}))
vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: vi.fn(),
}))
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => <div data-testid="transaction-modal" />,
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock(
  '@/features/transaction-manager/hooks/useActiveTransactionState',
  () => ({ useActiveTransactionState: () => undefined }),
)

// Grace state is the thing under test; drive it directly rather than through
// the expiry multicall it wraps (covered by useGraceStatus' own concerns).
// Each test swaps in a whole fresh object rather than editing fields, so no
// case can leak a stray field into the next one.
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
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// really `{ component, useParams, ... }` — the router's own types don't describe
// that shape, hence the cast.
const { Route } = await import('./burn')
const BurnRoute = (Route as unknown as { component: () => React.ReactElement })
  .component

// A live wrapped .eth 2LD: PARENT_CANNOT_CONTROL + IS_DOT_ETH burnt, no
// owner-controlled fuses yet — the state l2eth.eth was in when WEB-1259 was
// filed, minus the expiry.
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

describe('fuses/burn route', () => {
  it('renders the burn form for an active name owned by the connected account', () => {
    render(<BurnRoute />)

    expect(
      screen.getByRole('heading', { name: 'Burn fuses' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Cannot Unwrap')).toBeInTheDocument()
    expect(screen.queryByText('Fuses cannot be burned')).not.toBeInTheDocument()
  })

  // The bug in WEB-1259: the wrapper reverts `setFuses` with `Unauthorised`
  // throughout the grace period, but the page rendered a fully enabled form
  // because `ownerOf` still returns the connected account.
  it('blocks burning while the name is in its grace period', () => {
    graceStatus = {
      ...ACTIVE_GRACE,
      isInGrace: true,
      isExpired: true,
      graceEndDate: new Date('2026-08-27T17:43:48Z'),
    }

    render(<BurnRoute />)

    expect(screen.getByText('Fuses cannot be burned')).toBeInTheDocument()
    expect(screen.getByText('This name has expired')).toBeInTheDocument()
    expect(
      screen.getByText('Renew the name to burn fuses again.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Burn fuses' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Save changes/ }),
    ).not.toBeInTheDocument()
  })

  // Past grace the wrapper reports address(0) as owner, so the ownership check
  // would otherwise answer "you are not the owner" — true, but a misleading way
  // to say the registration lapsed.
  it('reports expiry rather than "not owner" once the name has dropped', () => {
    graceStatus = { ...ACTIVE_GRACE, isExpired: true }
    wrapperDataResult = {
      ...wrapperDataResult,
      data: { ...wrapperData, owner: undefined },
    }

    render(<BurnRoute />)

    expect(screen.getByText('Fuses cannot be burned')).toBeInTheDocument()
    expect(
      screen.getByText('This name is no longer registered.'),
    ).toBeInTheDocument()
    // No grace banner: the grace window is over, so "ends on <date>" would lie.
    expect(screen.queryByText('This name has expired')).not.toBeInTheDocument()
    expect(screen.queryByText('Not authorized')).not.toBeInTheDocument()
  })

  it('waits for the grace lookup before rendering the form', () => {
    graceStatus = { ...ACTIVE_GRACE, isLoading: true }

    render(<BurnRoute />)

    expect(
      screen.queryByRole('heading', { name: 'Burn fuses' }),
    ).not.toBeInTheDocument()
  })

  // A failed expiry lookup reads as `isExpired: false`, so failing open here
  // would hand an expired name straight back to the burn form.
  it('fails closed when the expiry lookup errors', () => {
    graceStatus = { ...ACTIVE_GRACE, error: new Error('rpc unavailable') }

    render(<BurnRoute />)

    expect(screen.getByText('Failed to check expiry')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Burn fuses' }),
    ).not.toBeInTheDocument()
  })

  it('still refuses a non-owner on an active name', () => {
    wrapperDataResult = {
      ...wrapperDataResult,
      data: { ...wrapperData, owner: '0xdead' },
    }

    render(<BurnRoute />)

    expect(screen.getByText('Not authorized')).toBeInTheDocument()
  })
})
