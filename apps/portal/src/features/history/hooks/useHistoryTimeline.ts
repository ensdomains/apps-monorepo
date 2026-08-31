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

/**
 * What every timeline surface renders from, whichever feed is behind it.
 *
 * `actions` is the loaded window; `anchorAction` is the name's first action,
 * pinned below the break when it is not already in the window. `totalCount`
 * counts the *feed*, filter included — not the loaded rows — so the break row's
 * "(N total)" describes what loading more would reach.
 */
export type HistoryTimelineModel = {
  readonly actions: readonly Action[]
  /** Every event type this name has, for the Event chip. Never narrowed by the
   * current selection — that is what made the chip collapse to one option. */
  readonly eventTypes: readonly string[]
  readonly anchorAction: Action | undefined
  readonly totalCount: number | undefined
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly isLoadingMore: boolean
  readonly isLoading: boolean
  readonly error: TimelineQueryError | null
  /** The v1 window filled up, so older v1 history exists that nothing can reach. */
  readonly isV1Truncated: boolean
  readonly openIds: ReadonlySet<Hex>
  readonly toggleAction: (txHash: Hex) => void
  /** Expand or collapse every loaded row at once. */
  readonly setAllOpen: (txHashes: readonly Hex[]) => void
}

/** Row-disclosure state, shared by every surface that renders action rows. */
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

/** Flatten loaded pages, reading `hasNextPage`/`totalCount` off the last one. */
const flattenTimelinePages = (data: InfiniteData<TimelinePage> | undefined) => {
  const pages = data?.pages ?? []
  const last = pages.at(-1)
  return {
    events: pages.flatMap((page) => page.events),
    hasNextPage: last?.hasNextPage ?? false,
    // Every page is counted against the same filter, so any page's figure is
    // the feed's — the last one is simply the freshest.
    totalCount: last?.totalCount,
  }
}

/**
 * The model for a feed that is nothing but its paged source — the protocol-wide
 * homepage feed, a registry's history. No v1 to merge and no registration to
 * anchor on, so the merge collapses to the boundary trim.
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
  /** The user's Event-chip selection, narrowing within `scope`. */
  readonly selectedTypes?: readonly string[]
  /** Inclusive unix-second bounds from the Date range chip. */
  readonly from?: number
  readonly to?: number
  /** Cap the rendered rows, for the Overview's preview. */
  readonly limit?: number
  /** Skip the ascending anchor read where nothing pins it (no break is drawn). */
  readonly withAnchor?: boolean
}

/**
 * A name's timeline: the paged v2 feed merged with its v1 and child-registration
 * history, plus the anchor row.
 *
 * The three reads are separate queries on purpose — paging the feed must not
 * refetch the v1 subgraph, and the anchor never changes as pages load.
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
  // A facet is already scoped; the chip narrows within it rather than replacing
  // it, so a selection outside the facet cannot widen the feed.
  const eventTypes = selectedTypes?.length
    ? (scope?.filter((type) => selectedTypes.includes(type)) ?? selectedTypes)
    : scope

  const feedScope = { name, eventTypes, from, to }
  // The auxiliary sources are read whole and never paged, so they are keyed on
  // the facet alone and narrowed in memory below. Putting the chip selection in
  // their key would refetch the v1 subgraph on every toggle, and would hide the
  // v1 types the chip needs to offer.
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

  // The paged query carries the filters in its `where`; the auxiliary sources
  // are read whole, so the same narrowing happens here — in memory, which is
  // exact for them because there is no window to fall out of.
  const auxiliaryAll = auxiliaryQuery.data?.events ?? []
  const auxiliaryEvents = auxiliaryAll.filter(
    (event) =>
      (from === undefined || event.timestamp >= from) &&
      (to === undefined || event.timestamp <= to) &&
      (!eventTypes || eventTypes.includes(event.type)),
  )

  const events = mergeTimeline({ pagedEvents, auxiliaryEvents, hasNextPage })

  // The connection counts only what it can reach, so a migrated name's v1 past
  // and a parent's child registrations have to be added back. This is what lets
  // the break row print a figure at all — the old timeline had to suppress it
  // for any name with v1 history rather than print one that omitted all of it.
  const totalCount =
    pagedTotalCount === undefined
      ? undefined
      : pagedTotalCount + auxiliaryEvents.length

  const allActions = summarizeEvents(events)
  const actions = limit === undefined ? allActions : allActions.slice(0, limit)

  // The anchor read only sees the v2 connection, so on a migrated name its
  // oldest event is the *v2* registration — not where the name actually began.
  // fox.eth pinned "Aug 12, 2026 Register name" while its real first event is
  // an ENSv1 registration from Apr 2024. The auxiliary sources are fetched
  // whole, so their oldest event is authoritative and folds in here.
  //
  // Summarized actions come back newest-first, so the first action is the last
  // of them.
  const anchorAction = withAnchor
    ? summarizeEvents(
        [...(anchorQuery.data ?? []), ...auxiliaryEvents].sort(
          (a, b) => b.timestamp - a.timestamp,
        ),
      ).at(-1)
    : undefined

  return {
    actions,
    // v1 types come from the auxiliary read, which the connection cannot see.
    // Deduplicated here rather than downstream: the auxiliary list is every v1
    // event the name has (172 on fox.eth) and is overwhelmingly repeats.
    eventTypes: [
      ...new Set([
        ...(eventTypesQuery.data ?? []),
        ...auxiliaryAll.map((event) => event.type),
      ]),
    ],
    anchorAction,
    totalCount,
    // The break is drawn on evidence of hidden history, not on having something
    // to pin: another page, or rows the preview limit is holding back.
    hasMore: hasNextPage || allActions.length > actions.length,
    loadMore: () => void pagesQuery.fetchNextPage(),
    isLoadingMore: pagesQuery.isFetchingNextPage,
    // Both the feed and its auxiliary sources gate the first paint: drawing
    // before v1 settles would show a v2-only history and then push older rows
    // in underneath it.
    isLoading: pagesQuery.isLoading || auxiliaryQuery.isLoading,
    // The auxiliary read failing costs v1 and child rows, not the timeline —
    // only the paged feed failing means there is nothing to show.
    error: pagesQuery.error,
    isV1Truncated: auxiliaryQuery.data?.v1Saturated ?? false,
    openIds,
    toggleAction,
    setAllOpen,
  }
}
