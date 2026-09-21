import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReverseResolutionResult } from '@/features/reverse-resolution/hooks/useReverseResolution'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import {
  createTestWrapper,
  expectSettled,
  renderWithCommitCounter,
} from '@/test-utils'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'

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

const LOADED = { data: REVERSE_RECORDS, error: null, isLoading: false }

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => LOADED,
  }
})

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

describe('addr reverse-resolution route', () => {
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
})
