import {
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQueries,
} from '@tanstack/react-query'
import { useState } from 'react'
import type { Hex } from 'viem'
import { mergeTimeline } from '../mergeTimeline'
import type { Action } from '../summarize/summarize.types'
import { summarizeEvents } from '../summarize/summarizeEvents'
import type { TimelineIndexerEvent } from '../timelineEvent'
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
  readonly eventTypes: readonly string[]
  readonly anchorAction: Action | undefined
  readonly totalCount: number | undefined
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly isLoadingMore: boolean
  readonly isLoading: boolean
  readonly error: TimelineQueryError | null
  readonly sourcesError: TimelineQueryError | null
  /** A bounded source hit its cap, so any total derived from it is a lower bound. */
  readonly isTruncated: boolean
  readonly openIds: ReadonlySet<Hex>
  readonly toggleAction: (txHash: Hex) => void
  readonly setAllOpen: (txHashes: readonly Hex[]) => void
}

/** Everything a feed may have beside its paged source. */
type TimelineSources = {
  /** Read whole, no cursor of their own: v1 history, child registrations. */
  readonly auxiliaryEvents?: readonly TimelineIndexerEvent[]
  /** Ascending slice for the pinned row; `undefined` pins nothing. */
  readonly anchorEvents?: readonly TimelineIndexerEvent[]
  readonly eventTypes?: readonly string[]
  readonly limit?: number
  readonly includeSubjectName?: boolean
  readonly isTruncated?: boolean
  readonly isLoadingSources?: boolean
  readonly sourcesError?: TimelineQueryError | null
}

const newestFirst = (a: TimelineIndexerEvent, b: TimelineIndexerEvent) =>
  b.timestamp - a.timestamp

const useActionDisclosure = () => {
  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  return {
    openIds,
    toggleAction: (txHash: Hex) =>
      setOpenIds((prev) => {
        const next = new Set(prev)
        if (next.has(txHash)) next.delete(txHash)
        else next.add(txHash)
        return next
      }),
    setAllOpen: (txHashes: readonly Hex[]) => setOpenIds(new Set(txHashes)),
  }
}

const useTimelineModel = (
  pagesQuery: UseInfiniteQueryResult<
    InfiniteData<TimelinePage>,
    TimelineQueryError
  >,
  {
    auxiliaryEvents = [],
    anchorEvents,
    eventTypes = [],
    limit,
    includeSubjectName = false,
    isTruncated = false,
    isLoadingSources = false,
    sourcesError = null,
  }: TimelineSources = {},
): HistoryTimelineModel => {
  const disclosure = useActionDisclosure()

  const pages = pagesQuery.data?.pages ?? []
  const hasNextPage = pages.at(-1)?.hasNextPage ?? false
  const pagedTotalCount = pages.at(-1)?.totalCount

  const pagedEvents = pages.flatMap((page) => page.events)
  const events = mergeTimeline({ pagedEvents, auxiliaryEvents, hasNextPage })

  // Counted by id, the way `mergeTimeline` merges. The sources are not supposed
  // to overlap — a child's `LabelRegistered` carries the child's namehash, so
  // the parent's connection never returns it — but counting raw length would
  // inflate the total past what renders if that ever stopped holding.
  const pagedIds = new Set(pagedEvents.map((event) => event.id))
  const auxiliaryCount = auxiliaryEvents.filter(
    (event) => !pagedIds.has(event.id),
  ).length
  const allActions = summarizeEvents(events, { includeSubjectName })
  const actions = limit === undefined ? allActions : allActions.slice(0, limit)

  return {
    ...disclosure,
    actions,
    eventTypes,
    anchorAction:
      anchorEvents &&
      summarizeEvents(
        [...anchorEvents, ...auxiliaryEvents].sort(newestFirst),
      ).at(-1),
    // Withheld entirely when either source is known short, rather than
    // presenting a lower bound as an exact count.
    totalCount:
      pagedTotalCount === undefined || isTruncated || sourcesError
        ? undefined
        : pagedTotalCount + auxiliaryCount,
    hasMore: hasNextPage || allActions.length > actions.length,
    loadMore: () => void pagesQuery.fetchNextPage(),
    isLoadingMore: pagesQuery.isFetchingNextPage,
    // The sources gate first paint too, or a paged-only history would render
    // and then have older rows pushed in underneath it.
    isLoading: pagesQuery.isLoading || isLoadingSources,
    error: pagesQuery.error,
    sourcesError,
    isTruncated,
  }
}

/** A feed that is nothing but its paged source — the homepage, a registry. */
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
  useTimelineModel(useInfiniteQuery(options), { includeSubjectName: true })

type UseNameHistoryTimelineParameters = {
  readonly name: string
  readonly scope?: readonly string[]
  readonly selectedTypes?: readonly string[]
  readonly from?: number
  readonly to?: number
  readonly limit?: number
  readonly shouldFetchAnchor?: boolean
}

export const useNameHistoryTimeline = ({
  name,
  scope,
  selectedTypes,
  from,
  to,
  limit,
  shouldFetchAnchor = true,
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
      {
        ...getNameHistoryAnchorQueryOptions(feedScope),
        enabled: shouldFetchAnchor,
      },
      getNameEventTypesQueryOptions(facetScope),
    ],
  })

  const auxiliaryAll = auxiliaryQuery.data?.events ?? []

  return useTimelineModel(pagesQuery, {
    auxiliaryEvents: auxiliaryAll.filter(
      (event) =>
        (from === undefined || event.timestamp >= from) &&
        (to === undefined || event.timestamp <= to) &&
        (!eventTypes || eventTypes.includes(event.type)),
    ),
    anchorEvents: shouldFetchAnchor ? (anchorQuery.data ?? []) : undefined,
    eventTypes: [
      ...new Set([
        ...(eventTypesQuery.data ?? []),
        ...auxiliaryAll.map((event) => event.type),
      ]),
    ],
    limit,
    isTruncated: auxiliaryQuery.data?.isTruncated ?? false,
    isLoadingSources: auxiliaryQuery.isLoading,
    sourcesError:
      auxiliaryQuery.error ?? anchorQuery.error ?? eventTypesQuery.error,
  })
}
