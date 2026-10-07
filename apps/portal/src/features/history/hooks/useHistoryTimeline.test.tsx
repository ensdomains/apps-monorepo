import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TimelineIndexerEvent } from '../timelineEvent'
import type { TimelinePage } from '../timelineEventPage'
import { timelinePageParams } from '../timelineEventPage'
import {
  TIMELINE_WINDOW_SIZE,
  useTimelinePagesModel,
} from './useHistoryTimeline'

/** One event per transaction, so an action is an event and the counts line up. */
const events = (count: number, from = 0): readonly TimelineIndexerEvent[] =>
  Array.from({ length: count }, (_, index) => {
    const n = from + index
    return {
      id: `e-${String(n)}`,
      type: 'TextChanged',
      transactionHash: `0x${String(n).padStart(40, '0')}` as const,
      blockNumber: 1000 - n,
      timestamp: 1000 - n,
    }
  })

/** `next` is the cursor of the page after this one; omitted ends the feed. */
const page = (
  events: readonly TimelineIndexerEvent[],
  next?: string,
): TimelinePage => ({
  events,
  endCursor: next ?? null,
  hasNextPage: next !== undefined,
  totalCount: undefined,
})

/**
 * Pages are addressed by index, so a cursor is just the next page's position.
 * `subject` rides in the query key, standing in for the address a registry feed
 * is keyed on.
 */
const renderFeed = (pages: readonly TimelinePage[]) => {
  const queryFn = vi.fn(
    ({ pageParam }: { pageParam: string | undefined }) =>
      pages[Number(pageParam ?? 0)] ?? page([]),
  )
  // One client for the whole render, not one per render pass.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return {
    ...renderHook(
      ({ subject }: { subject: string }) =>
        useTimelinePagesModel({
          queryKey: ['timeline-window-test', subject],
          queryFn,
          ...timelinePageParams,
        }),
      {
        initialProps: { subject: 'a' },
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    ),
    queryFn,
  }
}

describe('useTimelinePagesModel', () => {
  it('windows a fully-loaded feed that is still too long to render', async () => {
    // The case the network cannot page: everything is in hand — as it is for a
    // name whose tail is unpaged v1 history — and the list is still too long.
    const { result } = renderFeed([page(events(TIMELINE_WINDOW_SIZE * 2))])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE)
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loader.onMore())
    expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE * 2)
    expect(result.current.hasMore).toBe(false)
  })

  it('reveals loaded rows before asking the network for more', async () => {
    // Three windows' worth in the first page, so the first doubling is free.
    const loaded = TIMELINE_WINDOW_SIZE * 3
    const { result, queryFn } = renderFeed([
      page(events(loaded), '1'),
      page(events(10, loaded)),
    ])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(queryFn).toHaveBeenCalledOnce()
    expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE)

    // Loaded rows are still hidden, so this click costs no request.
    act(() => result.current.loader.onMore())
    expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE * 2)
    expect(queryFn).toHaveBeenCalledOnce()

    act(() => result.current.loader.onMore())
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(result.current.actions).toHaveLength(loaded + 10),
    )
  })

  it('keeps fetching until the window is filled with visible events', async () => {
    const { result, queryFn } = renderFeed([
      page(events(100), '1'),
      page(events(100, 100), '2'),
      page(events(100, 200), '3'),
      page(events(100, 300), '4'),
      page(events(100, 400), '5'),
      page(events(100, 500)),
    ])
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.loader.onMore())
    await waitFor(() => expect(result.current.loader.shown).toBe(100))
    act(() => result.current.loader.onMore())
    await waitFor(() => expect(result.current.loader.shown).toBe(200))
    act(() => result.current.loader.onMore())

    await waitFor(() => expect(result.current.loader.shown).toBe(400))
    expect(queryFn).toHaveBeenCalledTimes(5)
  })

  it('keeps an unknown total unknown once the feed ends', async () => {
    const { result } = renderFeed([page(events(TIMELINE_WINDOW_SIZE * 2))])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.totalCount).toBeUndefined()
    expect(result.current.loader.total).toBeUndefined()
    expect(result.current.loader.canShowAll).toBe(false)
    expect(result.current.loader.canShowMore).toBe(true)
  })

  it('closes a widened window when the feed changes subject', async () => {
    // These surfaces are reused across subjects — one registry page navigating
    // to another — so a window widened on the last one must not carry over.
    const { result, rerender } = renderFeed([
      page(events(TIMELINE_WINDOW_SIZE * 2)),
    ])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.loader.onMore())
    expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE * 2)

    rerender({ subject: 'b' })
    await waitFor(() =>
      expect(result.current.actions).toHaveLength(TIMELINE_WINDOW_SIZE),
    )
  })
})
