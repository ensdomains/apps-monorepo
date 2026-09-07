import { render as baseRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import type { HistoryTimelineModel } from '../hooks/useHistoryTimeline'
import type { Action } from '../summarize/summarize.types'
import { HistoryTimelineView } from './HistoryTimeline'

// The break row and the pinned anchor only appear on a feed with more history
// than fits — a shape the staging indexer has no data for (every name there is
// a single bulk-registration transaction). They are driven off the model here
// instead.

// The rows' sender batch is a network lookup; nothing here reads the actor.
vi.mock('@/features/profile/hooks/useTransactionSenders', () => ({
  useTransactionSenders: () => ({ data: undefined, error: null }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a href="#link" {...props}>
      {children}
    </a>
  ),
}))

const render = (ui: ReactElement) =>
  baseRender(ui, { wrapper: createTestWrapper() })

/**
 * Timeline rows, counted off the row element rather than its text: each row
 * renders its label twice, once for the narrow layout and once for the wide
 * one, with the container query picking between them at paint.
 */
const rowCount = () =>
  document.querySelectorAll('[role="button"][tabindex="0"]').length

const action = (tx: string, label: string, timestamp: number): Action => ({
  txHash: `0x${tx}`,
  icon: 'default',
  label,
  slots: [],
  timestamp,
  events: [
    {
      id: `${tx}-1`,
      type: 'TextChanged',
      transactionHash: `0x${tx}`,
      blockNumber: timestamp,
      timestamp,
    },
  ],
})

const model = (
  over: Partial<HistoryTimelineModel> = {},
): HistoryTimelineModel => ({
  actions: [action('a', 'set text record', 300)],
  eventTypes: [],
  anchorAction: undefined,
  totalCount: undefined,
  hasMore: false,
  loadMore: vi.fn(),
  isLoadingMore: false,
  isLoading: false,
  error: null,
  sourcesError: null,
  isTruncated: false,
  openIds: new Set(),
  toggleAction: vi.fn(),
  setAllOpen: vi.fn(),
  ...over,
})

describe('HistoryTimelineView', () => {
  it('keeps a matched transaction whole rather than narrowing it', () => {
    const register: Action = {
      ...action('r', 'registered', 5),
      events: [
        { type: 'NameRegistered', id: 'r-1' },
        { type: 'TextChanged', id: 'r-2' },
      ] as never,
    }
    render(<HistoryTimelineView model={model({ actions: [register] })} />)
    expect(screen.getAllByText('registered').length).toBeGreaterThan(0)
    expect(screen.queryByText('set text record')).toBeNull()
  })

  it('shows no break when the whole feed is on screen', () => {
    render(<HistoryTimelineView model={model()} breakContent="load-more" />)
    expect(screen.queryByRole('button', { name: /Load/ })).toBeNull()
  })

  it('renders the load-more break with the feed total, not the loaded count', () => {
    render(
      <HistoryTimelineView
        model={model({ hasMore: true, totalCount: 681 })}
        breakContent="load-more"
      />,
    )
    expect(screen.getByText('Load more')).toBeInTheDocument()
    expect(screen.getByText(/events \(681 total\)/)).toBeInTheDocument()
  })

  it('fetches the next page when the break is pressed', async () => {
    const loadMore = vi.fn()
    render(
      <HistoryTimelineView
        model={model({ hasMore: true, totalCount: 681, loadMore })}
        breakContent="load-more"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('says so in place while a page is in flight, and cannot be pressed twice', () => {
    render(
      <HistoryTimelineView
        model={model({ hasMore: true, totalCount: 681, isLoadingMore: true })}
        breakContent="load-more"
      />,
    )
    const button = screen.getByRole('button', { name: 'Loading…' })
    expect(button).toBeDisabled()
    expect(screen.queryByText('Load more')).toBeNull()
  })

  it('still offers the break when a page trims to no rows', async () => {
    // A page whose boundary trim empties it (one block filling the page) used
    // to dead-end on "No history yet" with more to come and nothing to click.
    const loadMore = vi.fn()
    render(
      <HistoryTimelineView
        model={model({ actions: [], hasMore: true, totalCount: 400, loadMore })}
        breakContent="load-more"
      />,
    )
    expect(screen.getByText(/No history yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('renders a link break instead when the surface points elsewhere', () => {
    render(
      <HistoryTimelineView
        model={model({ hasMore: true, totalCount: 16 })}
        breakContent={<a href="/x">full History</a>}
      />,
    )
    expect(screen.getByText('full History')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load/ })).toBeNull()
  })

  it('pins the anchor action below the break', () => {
    render(
      <HistoryTimelineView
        model={model({
          hasMore: true,
          anchorAction: action('z', 'registered', 1),
        })}
        breakContent="load-more"
      />,
    )
    expect(screen.getAllByText('registered').length).toBeGreaterThan(0)
    expect(rowCount()).toBe(2)
  })

  it('does not pin the anchor once paging has reached it', () => {
    const anchorAction = action('a', 'set text record', 300)
    render(
      <HistoryTimelineView
        model={model({ hasMore: true, anchorAction })}
        breakContent="load-more"
      />,
    )
    // Already the row above — pinning it would render the same action twice.
    expect(rowCount()).toBe(1)
  })

  it('does not pin the anchor when nothing is hidden', () => {
    render(
      <HistoryTimelineView
        model={model({
          hasMore: false,
          anchorAction: action('z', 'registered', 1),
        })}
        breakContent="load-more"
      />,
    )
    expect(screen.queryByText('registered')).toBeNull()
  })

  it('discloses a failed source even with no rows to show', () => {
    // "No history yet" must not stand in for history we simply could not load.
    render(
      <HistoryTimelineView
        model={model({
          actions: [],
          sourcesError: Object.assign(new Error('subgraph down'), {
            cause: { message: 'subgraph down' },
          }),
        })}
      />,
    )
    expect(screen.getByText(/No history yet/)).toBeInTheDocument()
    expect(
      screen.getByText(/Couldn't load all of this name's history/),
    ).toBeInTheDocument()
  })

  it('withholds the total when a source is known short', () => {
    const truncated = model({ hasMore: true, totalCount: undefined })
    render(<HistoryTimelineView model={truncated} breakContent="load-more" />)
    // A lower bound must not render as "(N total)".
    expect(screen.queryByText(/total\)/)).toBeNull()
    expect(screen.getByText('Load more')).toBeInTheDocument()
  })

  it('discloses a failed source instead of passing the gap off as complete', () => {
    render(
      <HistoryTimelineView
        model={model({
          sourcesError: Object.assign(new Error('subgraph down'), {
            cause: { message: 'subgraph down' },
          }),
          totalCount: 9,
        })}
      />,
    )
    expect(
      screen.getByText(/Couldn't load all of this name's history/),
    ).toBeInTheDocument()
  })

  it('discloses a capped source and withholds the total', () => {
    // Any bounded whole-read source — the v1 window, the 25-child cap — makes
    // the total a lower bound, so it must not render as exact.
    render(
      <HistoryTimelineView
        model={model({
          isTruncated: true,
          hasMore: true,
          totalCount: undefined,
        })}
        breakContent="load-more"
      />,
    )
    expect(
      screen.getByText(/too large to read in one request/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/total\)/)).toBeNull()
  })

  it('expands and collapses every loaded row at once', async () => {
    const setAllOpen = vi.fn()
    const actions = [action('a', 'One', 3), action('b', 'Two', 2)]
    render(<HistoryTimelineView model={model({ actions, setAllOpen })} />)
    await userEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(setAllOpen).toHaveBeenCalledWith(['0xa', '0xb'])
  })
})
