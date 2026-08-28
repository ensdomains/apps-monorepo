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
import type { TimelineIndexerEvent } from '../timelineEvent'
import type { TimelinePage } from '../timelineEventPage'
import {
  getNameHistoryAnchorQueryOptions,
  getNameHistoryAuxiliaryQueryOptions,
  getNameHistoryPagesQueryOptions,
  type NameHistoryScope,
} from './useNameHistoryTimeline'

/**
 * What every timeline surface renders from, whichever feed is behind it.
 *
 * `actions` is the loaded window; `anchorAction` is the name's first action,
 * pinned below the break when it is not already in the window. `totalCount`
 * counts the *feed*, filter included — not the loaded rows — so the break row's
 * "(N total)" describes what loading more would reach.
 */
export type TimelineQueryError = Error & {
  readonly cause?: { readonly message?: string }
}

export type HistoryTimelineModel = {
  readonly actions: Action[]
  readonly events: readonly TimelineIndexerEvent[]
  readonly anchorAction: Action | undefined
  readonly totalCount: number | undefined
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly isLoadingMore: boolean
  readonly isLoading: boolean
  /**
   * The tagged error the query threw. `cause` is the underlying
   * `GraphqlRequestError`, which is what the error messages quote.
   */
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
    events,
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

type UseNameHistoryTimelineParameters = NameHistoryScope & {
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
  limit,
  withAnchor = true,
  ...scope
}: UseNameHistoryTimelineParameters): HistoryTimelineModel => {
  const pagesQuery = useInfiniteQuery(getNameHistoryPagesQueryOptions(scope))
  const [auxiliaryQuery, anchorQuery] = useQueries({
    queries: [
      getNameHistoryAuxiliaryQueryOptions(scope),
      { ...getNameHistoryAnchorQueryOptions(scope), enabled: withAnchor },
    ],
  })
  const { openIds, toggleAction, setAllOpen } = useActionDisclosure()

  const {
    events: pagedEvents,
    hasNextPage,
    totalCount: pagedTotalCount,
  } = flattenTimelinePages(pagesQuery.data)

  // The date range is part of the paged query's `where`, but the auxiliary
  // sources are read whole and unfiltered — apply it to them here so the rows
  // on screen and the count beside them describe the same feed.
  const auxiliaryEvents = (auxiliaryQuery.data?.events ?? []).filter(
    (event) =>
      (scope.from === undefined || event.timestamp >= scope.from) &&
      (scope.to === undefined || event.timestamp <= scope.to),
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

  // Summarized actions come back newest-first, so the name's first action is
  // the last of the ascending window.
  const anchorAction = anchorQuery.data
    ? summarizeEvents(anchorQuery.data).at(-1)
    : undefined

  return {
    actions,
    events,
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
