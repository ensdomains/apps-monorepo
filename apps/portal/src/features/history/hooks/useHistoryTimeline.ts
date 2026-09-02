import {
  type InfiniteData,
  keepPreviousData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQueries,
} from '@tanstack/react-query'
import { useState } from 'react'
import type { Hex } from 'viem'
import { dropPagedDuplicates, mergeTimeline } from '../mergeTimeline'
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
  readonly selectedTypes?: readonly string[]
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
    selectedTypes,
    includeSubjectName = false,
    isTruncated = false,
    isLoadingSources = false,
    sourcesError = null,
  }: TimelineSources = {},
): HistoryTimelineModel => {
  const disclosure = useActionDisclosure()

  const pages = pagesQuery.data?.pages ?? []
  const pagedTotalCount = pages.at(-1)?.totalCount
  const hasNextPage = pagesQuery.hasNextPage

  const pagedEvents = pages.flatMap((page) => page.events)
  const events = mergeTimeline({ pagedEvents, auxiliaryEvents, hasNextPage })

  const summarized = summarizeEvents(events, { includeSubjectName })
  const kept = selectedTypes?.length && new Set(selectedTypes)
  const allActions = kept
    ? summarized.filter((action) =>
        action.events.some((event) => kept.has(event.type)),
      )
    : summarized
  const actions = limit === undefined ? allActions : allActions.slice(0, limit)

  return {
    ...disclosure,
    actions,
    eventTypes,
    anchorAction:
      anchorEvents &&
      summarizeEvents(
        [
          ...anchorEvents,
          ...dropPagedDuplicates(auxiliaryEvents, anchorEvents),
        ].sort(newestFirst),
      ).at(-1),
    // Withheld when a source is known short, rather than presenting a lower
    // bound as an exact count.
    //
    // The sum is only exact once the feed is fully loaded, because the auxiliary
    // sources overlap the paged one (see `dropPagedDuplicates`) and an overlap
    // on a page still unfetched cannot be seen. While pages remain, a name with
    // auxiliary events gets no count at all rather than one inflated by its own
    // duplicates — fox.eth printed 251 for 73 real events.
    totalCount:
      pagedTotalCount === undefined ||
      isTruncated ||
      sourcesError ||
      selectedTypes?.length ||
      (hasNextPage && auxiliaryEvents.length > 0)
        ? undefined
        : pagedTotalCount +
          dropPagedDuplicates(auxiliaryEvents, pagedEvents).length,
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
  /** The Event chip's options; skipped on the surfaces that render no chips. */
  readonly shouldFetchEventTypes?: boolean
}

/**
 * One retry for the auxiliary sources. They are read whole with no cursor, and
 * a single 503 from the indexer costs the whole v1 history, the pinned row or
 * the chip options for the life of the query — the client's global `retry: false`
 * suits reads a user can trigger again, which these are not.
 */
const SOURCE_QUERY_RETRY = 1

/** `scope` bounds what the surface may ever show; the chip narrows within it. */
const narrowScope = (
  scope: readonly string[] | undefined,
  selectedTypes: readonly string[] | undefined,
): readonly string[] | undefined => {
  if (!selectedTypes?.length) return scope
  return scope
    ? selectedTypes.filter((type) => scope.includes(type))
    : selectedTypes
}

export const useNameHistoryTimeline = ({
  name,
  scope,
  selectedTypes,
  from,
  to,
  limit,
  shouldFetchAnchor = true,
  shouldFetchEventTypes = true,
}: UseNameHistoryTimelineParameters): HistoryTimelineModel => {
  // Filtered in the query, not over loaded rows: narrowing in memory only
  // reached the pages already fetched, so on a long name picking "Register name"
  // showed "No matching history" above a Load more.
  const feedScope = {
    name,
    eventTypes: narrowScope(scope, selectedTypes),
    from,
    to,
  }
  // The auxiliary and vocabulary reads stay on the facet alone: putting the chip
  // selection in this key would refetch the v1 subgraph on every toggle, and
  // hide the v1 types the chip needs to offer.
  const facetScope = { name, eventTypes: scope }

  const pagesQuery = useInfiniteQuery({
    ...getNameHistoryPagesQueryOptions(feedScope),
    // A new date range or chip selection is a new key; without this the whole
    // surface — chips included — is replaced by the loading message, and the
    // control the user just touched disappears under them.
    placeholderData: keepPreviousData,
  })
  const [auxiliaryQuery, anchorQuery, eventTypesQuery] = useQueries({
    queries: [
      {
        ...getNameHistoryAuxiliaryQueryOptions(facetScope),
        retry: SOURCE_QUERY_RETRY,
      },
      {
        ...getNameHistoryAnchorQueryOptions(feedScope),
        enabled: shouldFetchAnchor,
        retry: SOURCE_QUERY_RETRY,
        // Keyed on the feed scope like the pages, so the pinned row holds its
        // last value instead of blanking while a new range loads.
        placeholderData: keepPreviousData,
      },
      {
        ...getNameEventTypesQueryOptions(facetScope),
        enabled: shouldFetchEventTypes,
        retry: SOURCE_QUERY_RETRY,
      },
    ],
  })

  const auxiliaryAll = auxiliaryQuery.data?.events ?? []

  return useTimelineModel(pagesQuery, {
    auxiliaryEvents: auxiliaryAll.filter(
      (event) =>
        (from === undefined || event.timestamp >= from) &&
        (to === undefined || event.timestamp <= to) &&
        (!scope || scope.includes(event.type)),
    ),
    anchorEvents: shouldFetchAnchor ? (anchorQuery.data ?? []) : undefined,
    eventTypes: [
      ...new Set([
        ...(eventTypesQuery.data ?? []),
        ...auxiliaryAll.map((event) => event.type),
      ]),
    ],
    limit,
    // Still narrowed in memory as well: the paged query filters the v2 feed, but
    // the auxiliary v1 events beside it are read on the unfiltered facet scope.
    selectedTypes,
    isTruncated: auxiliaryQuery.data?.isTruncated ?? false,
    isLoadingSources: auxiliaryQuery.isLoading,
    sourcesError:
      auxiliaryQuery.error ?? anchorQuery.error ?? eventTypesQuery.error,
  })
}
