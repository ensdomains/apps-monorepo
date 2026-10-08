import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { EventType } from '../timelineEvent'
import { fetchNameHistoryPage, timelinePageParams } from '../timelineEventPage'

/**
 * A name's history in two reads of bigname's name history: the paged feed, and
 * an ascending read for the anchor row. ENSv1 and ENSv2 rows come from the one
 * stream, so nothing is merged in beside it.
 */

/** Ascending window for the anchor read — wide enough to hold the oldest transaction. */
const ANCHOR_WINDOW = 20

export type NameHistoryScope = {
  readonly name: string
  /**
   * Applied in the query, not client-side: a page bounds the *whole* feed, so a
   * name with unrelated churn would spend the window before its facet's events
   * were reached. `undefined` reads every type.
   */
  readonly eventTypes?: readonly EventType[]
  /** Inclusive unix-second bounds from the Date range chip. */
  readonly from?: number
  readonly to?: number
  /**
   * Merge the direct children's registrations into the feed — the full history
   * only; a facet asked for specific types.
   */
  readonly includeChildRegistrations?: boolean
}

// ---------------------------------------------------------------- paged feed

const getNameHistoryPagesQueryKey = createQueryKey<
  'get-name-history-pages',
  NameHistoryScope
>('get-name-history-pages')

export const getNameHistoryPagesQueryOptions = (scope: NameHistoryScope) =>
  resultInfiniteQueryOptions({
    queryKey: getNameHistoryPagesQueryKey(scope),
    queryFn: ({ queryKey: [, scope], pageParam }) =>
      fetchNameHistoryPage({
        name: scope.name,
        types: scope.eventTypes,
        from: scope.from,
        to: scope.to,
        includeChildRegistrations: scope.includeChildRegistrations,
        cursor: pageParam,
      }),
    ...timelinePageParams,
  })

// ------------------------------------------------------------------- anchor

const getNameHistoryAnchorQueryKey = createQueryKey<
  'get-name-history-anchor',
  NameHistoryScope
>('get-name-history-anchor')

/**
 * The oldest slice of the name's history, for the pinned row. Uses the same
 * filter as the feed so a scoped facet anchors on *its* first event; `asc` is
 * the exact reverse of the feed's order.
 */
export const getNameHistoryAnchorQueryOptions = (scope: NameHistoryScope) =>
  resultQueryOptions({
    queryKey: getNameHistoryAnchorQueryKey(scope),
    queryFn: ({ queryKey: [, scope] }) =>
      fetchNameHistoryPage({
        name: scope.name,
        types: scope.eventTypes,
        from: scope.from,
        to: scope.to,
        includeChildRegistrations: scope.includeChildRegistrations,
        order: 'asc',
        pageSize: ANCHOR_WINDOW,
      }).map(({ events }) =>
        // Ascending out of bigname; the timeline renders newest-first.
        [...events].reverse(),
      ),
  })
