import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReverseResolutionResult } from '@/features/reverse-resolution/hooks/useReverseResolution'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import {
  createTestWrapper,
  expectSettled,
  renderWithCommitCounter,
} from '@/test-utils'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09' as Address
const OTHER_ADDRESS = '0x225f137127d9067788314bc7fcc1f36746a3c3b5' as Address

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

const emptyRecord = (
  coinType: number,
  label: string,
): ReverseResolutionResult => ({
  coinType,
  label,
  icon: '',
  name: null,
  reverseResolverAddress: null,
  resolverAddress: null,
  normalized: true,
  forwardMatch: false,
  defaultName: null,
  defaultForwardMatch: false,
})

/**
 * Held at module scope so the mocked query keeps one identity across renders,
 * exactly as a real query cache would — the property under test is about
 * reference stability, so a fresh result object per render would fake the
 * defect rather than reproduce the fix.
 *
 * The hook emits one row per configured network whether or not a record
 * exists, and the route treats "no row has a name" as empty, so at least one
 * row must carry a name for the table to render at all.
 */
const REVERSE_RECORDS: ReverseResolutionResult[] = [
  { ...emptyRecord(DEFAULT_EVM_COIN_TYPE, 'Default'), name: 'sugh004.eth' },
  emptyRecord(MAINNET_COIN_TYPE, 'Mainnet'),
]

/** What the hook returns for an address with nothing set anywhere. */
const NO_RECORDS: ReverseResolutionResult[] = [
  emptyRecord(DEFAULT_EVM_COIN_TYPE, 'Default'),
  emptyRecord(MAINNET_COIN_TYPE, 'Mainnet'),
]

const LOADED = { data: REVERSE_RECORDS, error: null, isLoading: false }
const LOADED_EMPTY = { data: NO_RECORDS, error: null, isLoading: false }

let queryResult: typeof LOADED = LOADED

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => queryResult,
  }
})

/**
 * Defaults to disconnected, which is what the real `useConnection` reports
 * under the test wrapper — the stability test below relies on that.
 */
let connectedAddress: Address | undefined

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    address: connectedAddress,
    isConnected: !!connectedAddress,
    chain: undefined,
  }),
}))

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// that object and `Route.component` is the page.
const { Route } = await import('./reverse-resolution')
const ReverseResolutionRoute = (
  Route as unknown as { component: () => ReactNode }
).component

/**
 * Settles in 2 commits today — the mount plus the arming re-render. Making the
 * rendered rows unstable (`data.filter(Boolean)` in the table options) drives it
 * to 214 in the same window, so 10 sits clear of the settled count and far
 * below a looping one.
 */
const MAX_SETTLED_COMMITS = 10

const renderRoute = () =>
  render(<ReverseResolutionRoute />, { wrapper: createTestWrapper() })

const EMPTY_STATE_TITLE = 'No reverse records yet'
const MORE_BUTTON = { name: 'More' }

describe('addr reverse-resolution route', () => {
  beforeEach(() => {
    queryResult = LOADED
    connectedAddress = undefined
  })

  /**
   * Only the loaded state is worth measuring. As on the forward-resolution
   * route, the loading / error / no-records branches return before the table is
   * rendered, so the `data ?? NO_ROWS` fallback is never the array a rendered
   * table reads and the auto-reset that drives the loop never registers. What
   * this guards is the reachable shape — the rows the table actually renders
   * staying stable across a re-render.
   */
  it('stops re-rendering once the reverse records are shown', async () => {
    const counter = renderWithCommitCounter(() => <ReverseResolutionRoute />, {
      wrapper: createTestWrapper(),
    })

    expect(await screen.findByText('sugh004.eth')).toBeInTheDocument()

    counter.rerenderSubject()

    await expectSettled(counter, MAX_SETTLED_COMMITS)
  })

  /**
   * The page used to swap the table for "No reverse records yet" whenever no
   * row carried a name. The table is the only route into the set-a-name flow,
   * so an address with nothing set — the one most likely to want it — had
   * nowhere to go. The rows themselves always exist: the hook emits one per
   * configured network regardless.
   */
  describe('with no reverse records anywhere', () => {
    beforeEach(() => {
      queryResult = LOADED_EMPTY
    })

    it('offers the row action on your own address', () => {
      connectedAddress = ADDRESS

      renderRoute()

      expect(screen.queryByText(EMPTY_STATE_TITLE)).not.toBeInTheDocument()
      // The networks a reverse name can be set on, each with its own trigger.
      expect(screen.getByText('Default')).toBeInTheDocument()
      expect(screen.getByText('Mainnet')).toBeInTheDocument()
      expect(screen.getAllByRole('button', MORE_BUTTON)).toHaveLength(
        NO_RECORDS.length,
      )
      // Otherwise the table reads as a column of "null"s with no explanation.
      expect(screen.getByText(/No reverse records set yet/)).toBeInTheDocument()
    })

    it('offers a visitor nothing on someone else’s address', () => {
      connectedAddress = OTHER_ADDRESS

      renderRoute()

      expect(screen.getByText(EMPTY_STATE_TITLE)).toBeInTheDocument()
      expect(screen.queryByRole('button', MORE_BUTTON)).not.toBeInTheDocument()
    })

    it('offers a disconnected visitor nothing', () => {
      renderRoute()

      expect(screen.getByText(EMPTY_STATE_TITLE)).toBeInTheDocument()
      expect(screen.queryByRole('button', MORE_BUTTON)).not.toBeInTheDocument()
    })
  })

  /**
   * The row actions were already withheld from a visitor; this pins that the
   * table rendering for everyone (because a record exists) doesn't hand them
   * over.
   */
  it('withholds the row action from a visitor when records do exist', () => {
    connectedAddress = OTHER_ADDRESS

    renderRoute()

    expect(screen.getByText('sugh004.eth')).toBeInTheDocument()
    expect(screen.queryByRole('button', MORE_BUTTON)).not.toBeInTheDocument()
  })
})
