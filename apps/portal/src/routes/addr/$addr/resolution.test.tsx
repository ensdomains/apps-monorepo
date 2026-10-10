import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ForwardName } from '@/features/forward-resolution/components/ForwardNamesTable/columns'
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

/**
 * Held at module scope so the mocked query keeps one identity across renders,
 * exactly as a real query cache would — the property under test is about
 * reference stability, so a fresh result object per render would fake the
 * defect rather than reproduce the fix.
 */
const RESOLVED_NAMES = [
  { name: 'sugh004.eth', coinTypes: ['60'] },
  { name: 'ensv2sg2.eth', coinTypes: ['60'] },
] satisfies ForwardName[]

const LOADED = { data: RESOLVED_NAMES, error: null, isLoading: false }

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => LOADED,
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// that object and `Route.component` is the page.
const { Route } = await import('./resolution')
const ResolutionRoute = (Route as unknown as { component: () => ReactNode })
  .component

/**
 * Settles in 2 commits today — the mount plus the arming re-render. Making the
 * rendered rows unstable (`data.filter(Boolean)` in the table options) drives it
 * to 293 in the same window, so 10 sits clear of the settled count and far below
 * a looping one.
 */
const MAX_SETTLED_COMMITS = 10

describe('addr resolution route', () => {
  /**
   * Only the loaded state is worth measuring here. The route returns
   * `LoadingMessage` / `ErrorMessage` / `NoResultsMessage` before it renders the
   * table, so its `data ?? NO_ROWS` fallback is never the array a rendered table
   * reads: with no rows the row models are never computed and the auto-reset
   * that drives the loop never registers. `NO_ROWS` is hardening, not a live
   * fix, and a test aimed at those states could not fail. What this guards is
   * the reachable shape — the rows the table actually renders staying stable.
   */
  it('stops re-rendering once the resolved names are shown', async () => {
    const counter = renderWithCommitCounter(() => <ResolutionRoute />, {
      wrapper: createTestWrapper(),
    })

    expect(await screen.findByText('sugh004.eth')).toBeInTheDocument()

    counter.rerenderSubject()

    await expectSettled(counter, MAX_SETTLED_COMMITS)
  })
})
