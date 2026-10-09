import {
  type InfiniteData,
  keepPreviousData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useState } from 'react'
import { dropClippedBoundary } from '../dropClippedBoundary'
import { toHistoryEventTypes } from '../eventTypes'
import type { Action } from '../summarize/summarize.types'
import { summarizeEvents } from '../summarize/summarizeEvents'
import {
  type EventType,
  HISTORY_EVENT_TYPES,
  type TimelineEvent,
} from '../timelineEvent'
import type { TimelinePage } from '../timelineEventPage'
import {
  getNameHistoryAnchorQueryOptions,
  getNameHistoryPagesQueryOptions,
} from './useNameHistoryTimeline'

/** A tagged query error; `cause` carries what failed underneath. */
export type TimelineQueryError = Error & { readonly cause?: unknown }

/** What every timeline surface renders from, whichever feed is behind it. */
export type HistoryTimelineModel = {
  readonly actions: readonly Action[]
  /** The Event chip's options: the types this surface may show. */
  readonly eventTypes: readonly EventType[]
  readonly anchorAction: Action | undefined
  readonly totalCount: number | undefined
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly isLoadingMore: boolean
  /** The last Load more failed; the rows already loaded stay. */
  readonly isLoadMoreError: boolean
  readonly isLoading: boolean
  readonly error: TimelineQueryError | null
  /** The anchor read failed, so the pinned first row may be missing. */
  readonly sourcesError: TimelineQueryError | null
  readonly openIds: ReadonlySet<string>
  readonly toggleAction: (actionId: string) => void
  readonly setAllOpen: (actionIds: readonly string[]) => void
}

export const TIMELINE_WINDOW_SIZE = 50

/**
 * The newest actions whose events fit the budget; `undefined` takes them all. A
 * transaction is never split across the break, so the last one admitted may
 * carry the count past the budget.
 */
const takeEvents = (
  actions: readonly Action[],
  budget: number | undefined,
): readonly Action[] => {
  if (budget === undefined) return actions
  let taken = 0
  const shown: Action[] = []
  for (const action of actions) {
    if (taken >= budget) break
    shown.push(action)
    taken += action.events.length
  }
  return shown
}

type TimelineOptions = {
  /** Ascending slice for the pinned row; `undefined` pins nothing. */
  readonly anchorEvents?: readonly TimelineEvent[]
  readonly eventTypes?: readonly EventType[]
  readonly limit?: number
  /** Events revealed per click; `undefined` renders every loaded action. */
  readonly windowSize?: number
  /** Changes when the feed's query does, so the window closes back to one page. */
  readonly resetKey?: string
  readonly includeSubjectName?: boolean
  readonly sourcesError?: TimelineQueryError | null
  /** Narrows loaded rows where bigname has no query filter for it. */
  readonly eventFilter?: (event: TimelineEvent) => boolean
}

const useActionDisclosure = () => {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())

  return {
    openIds,
    toggleAction: (actionId: string) =>
      setOpenIds((prev) => {
        const next = new Set(prev)
        if (next.has(actionId)) next.delete(actionId)
        else next.add(actionId)
        return next
      }),
    setAllOpen: (actionIds: readonly string[]) =>
      setOpenIds(new Set(actionIds)),
  }
}

const useTimelineModel = (
  pagesQuery: UseInfiniteQueryResult<
    InfiniteData<TimelinePage>,
    TimelineQueryError
  >,
  {
    anchorEvents,
    eventTypes = [],
    limit,
    windowSize,
    resetKey,
    includeSubjectName = false,
    sourcesError = null,
    eventFilter,
  }: TimelineOptions = {},
): HistoryTimelineModel => {
  const disclosure = useActionDisclosure()
  // Reset during render, not in an effect: a new query key must not paint its
  // first page through the previous list's widened window.
  const [visible, setVisible] = useState({ key: resetKey, count: windowSize })
  if (visible.key !== resetKey) setVisible({ key: resetKey, count: windowSize })
  const shown = visible.key === resetKey ? visible.count : windowSize

  const pages = pagesQuery.data?.pages ?? []
  const hasNextPage = pagesQuery.hasNextPage

  const loaded = dropClippedBoundary(
    pages.flatMap((page) => page.events),
    hasNextPage,
  )
  const events = eventFilter ? loaded.filter(eventFilter) : loaded
  const anchor =
    eventFilter && anchorEvents
      ? anchorEvents.filter(eventFilter)
      : anchorEvents

  const allActions = summarizeEvents(events, { includeSubjectName })
  // The window is counted in events and grows; `limit` is a fixed preview
  // counted in actions. A surface passes one or neither — `slice(0, undefined)`
  // is the whole list.
  const actions = takeEvents(allActions, shown).slice(0, limit)

  const loadedCount = allActions.reduce(
    (total, action) => total + action.events.length,
    0,
  )

  return {
    ...disclosure,
    actions,
    eventTypes,
    anchorAction: anchor && summarizeEvents(anchor).at(-1),
    // bigname counts over exactly the page's filters (type set and window
    // included), exact up to 10,000 rows and absent beyond. A client-side
    // filter makes that count too high, so none is shown.
    totalCount: eventFilter ? undefined : pages.at(-1)?.totalCount,
    hasMore: hasNextPage || allActions.length > actions.length,
    // Widen the window first; the network page is only worth fetching once it
    // has run past every loaded event.
    loadMore: () => {
      if (windowSize === undefined) return void pagesQuery.fetchNextPage()
      const widened = (shown ?? windowSize) + windowSize
      setVisible({ key: resetKey, count: widened })
      if (widened >= loadedCount) void pagesQuery.fetchNextPage()
    },
    isLoadingMore: pagesQuery.isFetchingNextPage,
    isLoadMoreError: pagesQuery.isFetchNextPageError,
    isLoading: pagesQuery.isLoading,
    error: pagesQuery.isFetchNextPageError ? null : pagesQuery.error,
    sourcesError,
  }
}

/** A feed that is nothing but its paged source — a registry, a contract. */
export const useTimelinePagesModel = <
  TError extends TimelineQueryError,
  TQueryKey extends QueryKey,
>(
  options: UseInfiniteQueryOptions<
    TimelinePage,
    TError,
    InfiniteData<TimelinePage>,
    TQueryKey,
    string | undefined
  >,
): HistoryTimelineModel =>
  useTimelineModel(useInfiniteQuery(options), {
    includeSubjectName: true,
    windowSize: TIMELINE_WINDOW_SIZE,
    // Keyed on the feed itself: these surfaces are reused across subjects — one
    // registry page navigating to another — and a window widened on the last
    // one must not carry into the next.
    resetKey: JSON.stringify(options.queryKey),
  })

type UseNameHistoryTimelineParameters = {
  readonly name: string
  /** What the surface may ever show, as bigname types. */
  readonly scope?: readonly EventType[]
  /** Narrows loaded rows within `scope`, where bigname has no query filter. */
  readonly eventFilter?: (event: TimelineEvent) => boolean
  readonly selectedTypes?: readonly EventType[]
  readonly from?: number
  readonly to?: number
  readonly limit?: number
  /** Events per click; omitted on the surfaces that offer no break. */
  readonly windowSize?: number
  readonly shouldFetchAnchor?: boolean
}

/**
 * One retry for the anchor read. A single 503 would otherwise cost the pinned
 * row for the life of the query — the client's global `retry: false` suits
 * reads a user can trigger again, which this is not.
 */
const SOURCE_QUERY_RETRY = 1

/** `scope` bounds what the surface may ever show; the chip narrows within it. */
const narrowScope = (
  scope: readonly EventType[] | undefined,
  selectedTypes: readonly EventType[] | undefined,
): readonly EventType[] | undefined => {
  if (!selectedTypes?.length) return scope
  return scope
    ? selectedTypes.filter((type) => scope.includes(type))
    : selectedTypes
}

export const useNameHistoryTimeline = ({
  name,
  scope,
  eventFilter,
  selectedTypes,
  from,
  to,
  limit,
  windowSize,
  shouldFetchAnchor = true,
}: UseNameHistoryTimelineParameters): HistoryTimelineModel => {
  const facet = toHistoryEventTypes(scope)
  // Filtered in the query, not over loaded rows: narrowing in memory only
  // reached the pages already fetched.
  const feedScope = {
    name,
    eventTypes: narrowScope(facet, selectedTypes),
    from,
    to,
    // Children's registrations belong to the full history only; a facet
    // asked for specific types. The chip selection does not change this, so
    // picking "Registration" keeps the children.
    includeChildRegistrations: facet === undefined,
  }

  const pagesQuery = useInfiniteQuery({
    ...getNameHistoryPagesQueryOptions(feedScope),
    // A new date range or chip selection is a new key; without this the whole
    // surface — chips included — is replaced by the loading message, and the
    // control the user just touched disappears under them.
    placeholderData: keepPreviousData,
  })
  const anchorQuery = useQuery({
    ...getNameHistoryAnchorQueryOptions(feedScope),
    enabled: shouldFetchAnchor,
    retry: SOURCE_QUERY_RETRY,
    // Keyed on the feed scope like the pages, so the pinned row holds its
    // last value instead of blanking while a new range loads.
    placeholderData: keepPreviousData,
  })

  return useTimelineModel(pagesQuery, {
    anchorEvents: shouldFetchAnchor ? (anchorQuery.data ?? []) : undefined,
    // The vocabulary is closed, so the chips need no read of their own.
    eventTypes: facet ?? HISTORY_EVENT_TYPES,
    limit,
    windowSize,
    // A new range or chip selection is a new list; the widened window closes
    // back to its first page with it.
    resetKey: JSON.stringify(feedScope),
    sourcesError: anchorQuery.error,
    eventFilter,
  })
}
