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
  actions: [action('a', 'Set text record', 300)],
  eventTypes: [],
  anchorAction: undefined,
  totalCount: undefined,
  hasMore: false,
  loadMore: vi.fn(),
  isLoadingMore: false,
  isLoading: false,
  error: null,
  isV1Truncated: false,
  openIds: new Set(),
  toggleAction: vi.fn(),
  setAllOpen: vi.fn(),
  ...over,
})

describe('HistoryTimelineView', () => {
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
    expect(screen.getByText(/Load 100 more/)).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: /Load 100 more/ }))
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
    expect(screen.queryByText(/Load 100 more/)).toBeNull()
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
          anchorAction: action('z', 'Register name', 1),
        })}
        breakContent="load-more"
      />,
    )
    expect(screen.getAllByText('Register name').length).toBeGreaterThan(0)
    expect(rowCount()).toBe(2)
  })

  it('does not pin the anchor once paging has reached it', () => {
    const anchorAction = action('a', 'Set text record', 300)
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
          anchorAction: action('z', 'Register name', 1),
        })}
        breakContent="load-more"
      />,
    )
    expect(screen.queryByText('Register name')).toBeNull()
  })

  it('discloses v1 history the subgraph window could not reach', () => {
    render(<HistoryTimelineView model={model({ isV1Truncated: true })} />)
    expect(screen.getByText(/more ENSv1 history/)).toBeInTheDocument()
  })

  it('expands and collapses every loaded row at once', async () => {
    const setAllOpen = vi.fn()
    const actions = [action('a', 'One', 3), action('b', 'Two', 2)]
    render(<HistoryTimelineView model={model({ actions, setAllOpen })} />)
    await userEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(setAllOpen).toHaveBeenCalledWith(['0xa', '0xb'])
  })
})
