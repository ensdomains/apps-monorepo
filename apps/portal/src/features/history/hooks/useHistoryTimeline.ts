import {
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  useInfiniteQuery,
  useQueries,
} from '@tanstack/react-query'
import { useState } from 'react'
import type { Hex } from 'viem'
import { mergeTimeline } from '../mergeTimeline'
import type { Action } from '../summarize/summarize.types'
import { summarizeEvents } from '../summarize/summarizeEvents'
import type { TimelinePage } from '../timelineEventPage'
import {
  getNameEventTypesQueryOptions,
  getNameHistoryAnchorQueryOptions,
  getNameHistoryAuxiliaryQueryOptions,
  getNameHistoryPagesQueryOptions,
} from './useNameHistoryTimeline'

/** A tagged query error, whose `cause` carries the underlying `ClientError`. */
export type TimelineQueryError = Error & {
  readonly cause?: { readonly message?: string }
}

/** What every timeline surface renders from, whichever feed is behind it. */
export type HistoryTimelineModel = {
  readonly actions: readonly Action[]
  /** Never narrowed by the current selection — that collapsed the chip to one option. */
  readonly eventTypes: readonly string[]
  readonly anchorAction: Action | undefined
  readonly totalCount: number | undefined
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly isLoadingMore: boolean
  readonly isLoading: boolean
  readonly error: TimelineQueryError | null
  /** A v1 collection filled its window, so older v1 history exists unreachably. */
  readonly isV1Truncated: boolean
  readonly openIds: ReadonlySet<Hex>
  readonly toggleAction: (txHash: Hex) => void
  readonly setAllOpen: (txHashes: readonly Hex[]) => void
}

const useActionDisclosure = () => {
  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  const toggleAction = (txHash: Hex) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(txHash)) next.delete(txHash)
      else next.add(txHash)
      return next
    })

  const setAllOpen = (txHashes: readonly Hex[]) => setOpenIds(new Set(txHashes))

  return { openIds, toggleAction, setAllOpen }
}

const flattenTimelinePages = (data: InfiniteData<TimelinePage> | undefined) => {
  const pages = data?.pages ?? []
  const last = pages.at(-1)
  return {
    events: pages.flatMap((page) => page.events),
    hasNextPage: last?.hasNextPage ?? false,
    totalCount: last?.totalCount,
  }
}

/**
 * A feed that is nothing but its paged source — the homepage, a registry. No v1
 * to merge and no registration to anchor on.
 */
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
): HistoryTimelineModel => {
  const pagesQuery = useInfiniteQuery(options)
  const { openIds, toggleAction, setAllOpen } = useActionDisclosure()

  const {
    events: pagedEvents,
    hasNextPage,
    totalCount,
  } = flattenTimelinePages(pagesQuery.data)
  const events = mergeTimeline({ pagedEvents, hasNextPage })
  const actions = summarizeEvents(events, { includeSubjectName: true })

  return {
    actions,
    eventTypes: [],
    anchorAction: undefined,
    totalCount,
    hasMore: hasNextPage,
    loadMore: () => void pagesQuery.fetchNextPage(),
    isLoadingMore: pagesQuery.isFetchingNextPage,
    isLoading: pagesQuery.isLoading,
    error: pagesQuery.error,
    isV1Truncated: false,
    openIds,
    toggleAction,
    setAllOpen,
  }
}

type UseNameHistoryTimelineParameters = {
  readonly name: string
  /** The facet's own event types (ownership, resolver, …); stable per surface. */
  readonly scope?: readonly string[]
  /** The Event-chip selection, narrowing within `scope`. */
  readonly selectedTypes?: readonly string[]
  readonly from?: number
  readonly to?: number
  /** Cap the rendered rows, for the Overview's preview. */
  readonly limit?: number
  readonly withAnchor?: boolean
}

/**
 * Separate queries on purpose: paging the feed must not refetch the v1 subgraph,
 * and the anchor does not change as pages load.
 */
export const useNameHistoryTimeline = ({
  name,
  scope,
  selectedTypes,
  from,
  to,
  limit,
  withAnchor = true,
}: UseNameHistoryTimelineParameters): HistoryTimelineModel => {
  // The chip narrows within the facet rather than replacing it, so a selection
  // outside the facet cannot widen the feed.
  const eventTypes = selectedTypes?.length
    ? (scope?.filter((type) => selectedTypes.includes(type)) ?? selectedTypes)
    : scope

  const feedScope = { name, eventTypes, from, to }
  // Keyed on the facet alone and narrowed in memory below: putting the chip
  // selection in this key would refetch the v1 subgraph on every toggle, and
  // hide the v1 types the chip needs to offer.
  const facetScope = { name, eventTypes: scope }

  const pagesQuery = useInfiniteQuery(
    getNameHistoryPagesQueryOptions(feedScope),
  )
  const [auxiliaryQuery, anchorQuery, eventTypesQuery] = useQueries({
    queries: [
      getNameHistoryAuxiliaryQueryOptions(facetScope),
      { ...getNameHistoryAnchorQueryOptions(feedScope), enabled: withAnchor },
      getNameEventTypesQueryOptions(facetScope),
    ],
  })
  const { openIds, toggleAction, setAllOpen } = useActionDisclosure()

  const {
    events: pagedEvents,
    hasNextPage,
    totalCount: pagedTotalCount,
  } = flattenTimelinePages(pagesQuery.data)

  // The paged query filters in its `where`; the whole-read sources filter here.
  const auxiliaryAll = auxiliaryQuery.data?.events ?? []
  const auxiliaryEvents = auxiliaryAll.filter(
    (event) =>
      (from === undefined || event.timestamp >= from) &&
      (to === undefined || event.timestamp <= to) &&
      (!eventTypes || eventTypes.includes(event.type)),
  )

  const events = mergeTimeline({ pagedEvents, auxiliaryEvents, hasNextPage })

  // The connection counts only what it can reach, so v1 and child registrations
  // are added back.
  const totalCount =
    pagedTotalCount === undefined
      ? undefined
      : pagedTotalCount + auxiliaryEvents.length

  const allActions = summarizeEvents(events)
  const actions = limit === undefined ? allActions : allActions.slice(0, limit)

  // The anchor read sees only v2, so on a migrated name its oldest event is the
  // *v2* registration — fox.eth pinned Aug 2026 over its real Apr 2024 ENSv1
  // start. The whole-read sources are authoritative for the tail, so they fold in.
  const anchorAction = withAnchor
    ? summarizeEvents(
        [...(anchorQuery.data ?? []), ...auxiliaryEvents].sort(
          (a, b) => b.timestamp - a.timestamp,
        ),
      ).at(-1)
    : undefined

  return {
    actions,
    // v1 types come from the auxiliary read; deduped here because that list is
    // every v1 event the name has and is overwhelmingly repeats.
    eventTypes: [
      ...new Set([
        ...(eventTypesQuery.data ?? []),
        ...auxiliaryAll.map((event) => event.type),
      ]),
    ],
    anchorAction,
    totalCount,
    // Drawn on evidence of hidden history, not on having something to pin.
    hasMore: hasNextPage || allActions.length > actions.length,
    loadMore: () => void pagesQuery.fetchNextPage(),
    isLoadingMore: pagesQuery.isFetchingNextPage,
    // v1 gates first paint too, or a v2-only history would render and then have
    // older rows pushed in underneath it.
    isLoading: pagesQuery.isLoading || auxiliaryQuery.isLoading,
    // An auxiliary failure costs v1 rows, not the timeline.
    error: pagesQuery.error,
    isV1Truncated: auxiliaryQuery.data?.v1Saturated ?? false,
    openIds,
    toggleAction,
    setAllOpen,
  }
}
