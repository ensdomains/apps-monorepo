import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { namehash, normalize } from 'viem/ens'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { graphqlIndexerClient } from '@/lib/indexer'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  TIMELINE_EVENT_FRAGMENT,
  type TimelineIndexerEvent,
} from '../timelineEvent'
import {
  fetchTimelineEventPage,
  HISTORY_TIMELINE_PAGE_SIZE,
  type TimelineEventFilter,
  timelinePageParams,
} from '../timelineEventPage'
import { adaptV1Events } from '../v1/adaptV1Events'
import { fetchV1NameHistory } from '../v1/fetchV1NameHistory'

/**
 * A name's history, in three reads.
 *
 * **Paged** — the v2 indexer's top-level `eventConnection`, filtered to the
 * name's namehash. This is the only source with a cursor, so it is what "load
 * more" advances and what `totalCount` counts.
 *
 * **Auxiliary** — v1 subgraph events, plus the child registrations attributed to
 * a parent. Neither can share the connection's cursor (the v1 subgraph is a
 * different service, and a child's `LabelRegistered` carries the *child's*
 * namehash), so both are read once, in full, and held to the paged source's
 * horizon by `mergeTimeline`.
 *
 * **Anchor** — the same connection read ascending, for the name's first action.
 * Both designs pin it below the break so a truncated history still shows where
 * the name began.
 */

class GetNameHistoryTimelineError extends TaggedError(
  'GetNameHistoryTimelineError',
)<{
  cause: GraphqlRequestError
}> {}

/**
 * Direct children come from `subdomains`, not a `name_ends_with` suffix match:
 * the suffix also matches every deeper descendant, so `a.b.leon.eth` would land
 * in `leon.eth`'s timeline.
 *
 * These are not the *newest* children — `subdomains` accepts `orderBy` /
 * `orderDirection` but ignores them, always sorting by name — so a parent with
 * more children than this contributes its alphabetically-first ones. Sorting
 * client-side would mean fetching every child, the unbounded query this limit
 * exists to avoid.
 * TODO(indexer): honour `orderBy: createdAt` on `subdomains`.
 */
const HISTORY_TIMELINE_CHILD_LIMIT = 25

/**
 * Per-collection window for the v1 subgraph read.
 *
 * v1 history has no cursor to page: `fetchV1NameHistory` fans out into sibling
 * `events(first:)` selections across the domain, its registration and every
 * resolver it ever used, and there is no ordering that makes one offset
 * meaningful across all of them. So it is read once and the read reports whether
 * it saturated rather than quietly truncating — see `v1Saturated` below.
 *
 * This is the width the query has always been issued at, and the one the
 * subgraph's complexity limit is known to accept — `fetchV1NameHistory` notes
 * that the query is rejected outright when `$first` is left unsupplied and each
 * sibling selection is costed at its worst case. Widening it is not free.
 */
const V1_HISTORY_WINDOW = 100

/**
 * Window for the ascending anchor read. Wide enough that the oldest *complete*
 * transaction is inside it, narrow enough to stay cheap — the anchor is one row.
 */
const ANCHOR_WINDOW = 20

export type NameHistoryScope = {
  readonly name: string
  /**
   * Restrict the feed to these event types, for the per-facet views (address
   * resolution, ownership, …) and the Event filter chip.
   *
   * Applied in the query rather than client-side: a page bounds the *whole*
   * feed, so a name with a lot of unrelated churn (fox.eth has 66 `TextChanged`)
   * would spend the window before its facet's events were reached.
   *
   * Plain strings, not `TimelineEventType`: the Event chip offers whatever the
   * loaded feed contains, and the indexer emits types the summarize engine has
   * no descriptor for (`VersionChanged`, `AbiChanged`, `PubkeyChanged` … — 21
   * descriptors against a wider vocabulary), which `humanizeType` renders
   * anyway. Narrowing here bought nothing but a cast at the call site that
   * claimed those were descriptor keys. The values reach the query as a
   * variable, so there is no injection surface to guard either.
   */
  readonly eventTypes?: readonly string[]
  /** Inclusive unix-second bounds from the Date range chip. */
  readonly from?: number
  readonly to?: number
}

/**
 * Normalize a name, tolerating one the UGC layer never normalized — matching
 * what the page's other queries key on.
 */
const normalizeOrLower = (name: string): string => {
  try {
    return normalize(name)
  } catch {
    return name.toLowerCase()
  }
}

const toEventFilter = ({
  name,
  eventTypes,
  from,
  to,
}: NameHistoryScope): TimelineEventFilter => ({
  namehash: namehash(normalizeOrLower(name)),
  ...(eventTypes && { type_in: eventTypes }),
  ...(from !== undefined && { timestamp_gte: from }),
  ...(to !== undefined && { timestamp_lte: to }),
})

// ---------------------------------------------------------------- paged feed

const getNameHistoryPagesQueryKey = createQueryKey<
  'get-name-history-pages',
  NameHistoryScope
>('get-name-history-pages')

/** The name's own events, newest first, one page per `fetchNextPage`. */
export const getNameHistoryPagesQueryOptions = (scope: NameHistoryScope) =>
  resultInfiniteQueryOptions({
    queryKey: getNameHistoryPagesQueryKey(scope),
    queryFn: ({ queryKey: [, scope], pageParam }) =>
      fetchTimelineEventPage({
        where: toEventFilter(scope),
        first: HISTORY_TIMELINE_PAGE_SIZE,
        after: pageParam,
      }),
    ...timelinePageParams,
  })

// ------------------------------------------------------------------- anchor

const getNameHistoryAnchorQueryKey = createQueryKey<
  'get-name-history-anchor',
  NameHistoryScope
>('get-name-history-anchor')

/**
 * The oldest slice of the name's history — the pinned row below the break.
 *
 * Reads with the same filter as the paged feed, so a scoped facet anchors on
 * *its* first event rather than on a registration it does not show.
 */
export const getNameHistoryAnchorQueryOptions = (scope: NameHistoryScope) =>
  resultQueryOptions({
    queryKey: getNameHistoryAnchorQueryKey(scope),
    queryFn: ({ queryKey: [, scope] }) =>
      fetchTimelineEventPage({
        where: toEventFilter(scope),
        first: ANCHOR_WINDOW,
        orderDirection: 'asc',
      }).map(({ events }) =>
        // Ascending out of the indexer; the timeline renders newest-first.
        [...events].sort((a, b) => b.timestamp - a.timestamp),
      ),
  })

// ------------------------------------------------------------ type vocabulary

/**
 * How many events from *each end* of the name's history the Event chip's option
 * list is derived from.
 *
 * Read from both ends rather than one wide descending window: the types that
 * only ever occur once sit at the *start* of a name's history — `NameRegistered`,
 * `LabelReserved` — so a newest-first window on a busy name drops exactly the
 * options people most want to filter by. Measured against staging,
 * `LabelReserved` was invisible from the newest end alone.
 *
 * The width is set from a measured coverage curve rather than a guess: against
 * the protocol-wide feed, 25 per end already surfaced every distinct type, and
 * 50/100/250 added nothing while costing 15KB/30KB/74KB. 50 is double the
 * observed plateau, so it keeps headroom and stays ~15KB at the cap.
 *
 * Hardcoding the vocabulary instead would mean ~28 fixed options against the 5
 * a typical name actually has — every extra one a dead end that renders "No
 * matching history".
 */
const EVENT_TYPES_WINDOW = 50

const nameEventTypesQuery = gql`
  query getNameEventTypes($where: EventFilter, $first: Int) {
    newest: eventConnection(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: $where
    ) {
      edges {
        node {
          type
        }
      }
    }
    oldest: eventConnection(
      first: $first
      orderBy: timestamp
      orderDirection: asc
      where: $where
    ) {
      edges {
        node {
          type
        }
      }
    }
  }
`

const getNameEventTypesQueryKey = createQueryKey<
  'get-name-event-types',
  NameHistoryScope
>('get-name-event-types')

/**
 * The event types the Event chip offers.
 *
 * Read *without* the user's current selection in the `where`, which is the
 * whole point: the feed query is filtered server-side now, so deriving the
 * options from its results would collapse the list to whatever is already
 * selected — pick one type and the other options vanish, with no way back.
 * The date range is left out for the same reason, so narrowing a range cannot
 * make an option disappear underneath the cursor.
 *
 * A facet's `scope` *is* applied: the ownership view should only ever offer
 * ownership types.
 */
export const getNameEventTypesQueryOptions = (scope: NameHistoryScope) =>
  resultQueryOptions({
    queryKey: getNameEventTypesQueryKey(scope),
    queryFn: ({ queryKey: [, scope] }) =>
      fromPromise(
        graphqlIndexerClient
          .request<
            Record<
              'newest' | 'oldest',
              {
                readonly edges: readonly { readonly node: { type: string } }[]
              } | null
            >
          >(nameEventTypesQuery, {
            where: toEventFilter(scope),
            first: EVENT_TYPES_WINDOW,
          })
          .then(({ newest, oldest }) => [
            ...new Set(
              [...(newest?.edges ?? []), ...(oldest?.edges ?? [])].map(
                ({ node }) => node.type,
              ),
            ),
          ]),
        (e) => new GetNameHistoryTimelineError({ cause: e as ClientError }),
      ),
  })

// --------------------------------------------------------- auxiliary sources

/**
 * A child's registration is attributed to the parent on the full feed only. A
 * scoped view asked for specific event types, and a subdomain `LabelRegistered`
 * is never one of them, so it would otherwise slip past the scope filter.
 *
 * `type_in` stays an inline literal here: this indexer silently drops a `where`
 * on the *nested* `events` field when it arrives by variable (verified against
 * staging for a list, a scalar and a whole-`EventFilter` variable — all returned
 * the unfiltered feed, no error). Only the top-level connection is unaffected.
 */
const childRegistrationsQuery = gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query getNameChildRegistrations($name: String!) {
    domains(where: { name: $name }, first: 1) {
      subdomains(first: ${String(HISTORY_TIMELINE_CHILD_LIMIT)}) {
        events(
          first: 1
          orderBy: timestamp
          orderDirection: asc
          where: { type_in: ["LabelRegistered"] }
        ) {
          ...TimelineEvent
        }
      }
    }
  }
`

/**
 * The name's history that the paged connection cannot reach: v1 subgraph events
 * and child registrations.
 *
 * Keyed without a cursor and fetched once, so paging the v2 feed never refetches
 * either of them.
 */
const getNameHistoryAuxiliary = ResultFn(async function* ({
  name,
  eventTypes,
}: NameHistoryScope) {
  const client = yield* safeGetClient()
  const normalizedName = normalizeOrLower(name)
  const node = namehash(normalizedName)

  // Each source returns `[]` for a name the other owns, so an empty result is
  // normal and only a genuine failure rejects.
  const [children, v1Raw] = yield* fromPromise(
    Promise.all([
      eventTypes
        ? Promise.resolve([])
        : graphqlIndexerClient
            .request<{
              domains: {
                readonly subdomains?: readonly {
                  readonly events: readonly TimelineIndexerEvent[]
                }[]
              }[]
            }>(childRegistrationsQuery, { name: normalizedName })
            .then(({ domains: [domain] }) =>
              (domain?.subdomains ?? []).flatMap(({ events }) => events),
            ),
      fetchV1NameHistory({
        subgraphUrl: client.chain.subgraphs.ens.url,
        namehash: node,
        first: V1_HISTORY_WINDOW,
        orderDirection: 'desc',
        eventTypes,
      }),
    ]),
    (e) => new GetNameHistoryTimelineError({ cause: e as GraphqlRequestError }),
  )

  // v1 events carry no timestamp; the timeline sorts and dates on one.
  const blockTimestamps = yield* getBlockTimestamps({
    blocks: v1Raw.events.map((event) => BigInt(event.blockNumber)),
  })

  // Static chain constants, not lookups — the v1 subgraph records no emitting
  // address, so the contract badge is reconstructed from these.
  const v1EventsAll = adaptV1Events({
    events: v1Raw.events,
    blockTimestamps,
    name: normalizedName,
    namehash: node,
    contracts: {
      registry: client.chain.contracts.ensRegistry.address,
      nameWrapper: client.chain.contracts.ensNameWrapper.address,
      baseRegistrar:
        client.chain.contracts.ensBaseRegistrarImplementation.address,
    },
  })

  // `fetchV1NameHistory` scopes resolver events in the query, but domain and
  // registration events share one unscoped window, so they are dropped here.
  // This runs after adapting because `adaptV1Events` is what renames some v1
  // types into their v2 equivalents — filtering earlier would compare against
  // the wrong vocabulary.
  const scopedTypes = eventTypes && new Set<string>(eventTypes)
  const v1Events = scopedTypes
    ? v1EventsAll.filter((event) => scopedTypes.has(event.type))
    : v1EventsAll

  return ok({
    events: [...v1Events, ...children],
    // Whether the v1 read filled a window, i.e. the name may have v1 history
    // this does not carry. Surfaced rather than hidden — a v1 name has no
    // cursor to offer a "load more".
    //
    // Reported per collection by the fetch, not inferred from the flattened
    // length here: `first` bounds each sibling selection separately, so the
    // total legitimately exceeds it — see `v1CollectionsSaturated`.
    v1Saturated: v1Raw.saturated,
  })
})

const getNameHistoryAuxiliaryQueryKey = createQueryKey<
  'get-name-history-auxiliary',
  NameHistoryScope
>('get-name-history-auxiliary')

export const getNameHistoryAuxiliaryQueryOptions = (scope: NameHistoryScope) =>
  resultQueryOptions({
    queryKey: getNameHistoryAuxiliaryQueryKey(scope),
    queryFn: ({ queryKey: [, scope] }) => getNameHistoryAuxiliary(scope),
  })
