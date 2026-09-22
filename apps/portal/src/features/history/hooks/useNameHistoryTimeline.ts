import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { namehash } from 'viem/ens'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { graphqlIndexerClient } from '@/lib/indexer'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
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
 * A name's history in three reads: the paged v2 `eventConnection`; the auxiliary
 * v1 + child-registration events, which have no cursor and are read whole; and
 * an ascending read for the anchor row.
 */

class GetNameHistoryTimelineError extends TaggedError(
  'GetNameHistoryTimelineError',
)<{
  cause: GraphqlRequestError
}> {}

/**
 * `subdomains` ignores `orderBy`/`orderDirection` and always sorts by name, so a
 * parent with more children than this contributes its alphabetically-first ones.
 * TODO(indexer): honour `orderBy: createdAt` on `subdomains`.
 */
const HISTORY_TIMELINE_CHILD_LIMIT = 25

/**
 * Per-collection window for the v1 subgraph read, which has no cursor to page.
 * This is the width the query has always shipped at and the one the subgraph's
 * complexity limit is known to accept — widening it is not free.
 */
const V1_HISTORY_WINDOW = 100

/** Ascending window for the anchor read — wide enough to hold the oldest transaction. */
const ANCHOR_WINDOW = 20

export type NameHistoryScope = {
  readonly name: string
  /**
   * Applied in the query, not client-side: a page bounds the *whole* feed, so a
   * name with unrelated churn would spend the window before its facet's events
   * were reached.
   *
   * Plain strings rather than `TimelineEventType` because the indexer emits
   * types the summarize engine has no descriptor for (`VersionChanged`,
   * `AbiChanged`, …), which `humanizeType` renders anyway.
   */
  readonly eventTypes?: readonly string[]
  /** Inclusive unix-second bounds from the Date range chip. */
  readonly from?: number
  readonly to?: number
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
 * The oldest slice of the name's history, for the pinned row. Uses the same
 * filter as the feed so a scoped facet anchors on *its* first event.
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
 * Events sampled from *each end* for the Event chip. Both ends because the
 * once-only types sit at the *start* of a history (`NameRegistered`,
 * `LabelReserved` — the latter was invisible from the newest end alone). 50
 * because coverage plateaued at 25 in measurement; wider only cost bytes.
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
 * Read *without* the current selection or date range in the `where`. The feed is
 * filtered server-side, so deriving options from its results collapsed the list
 * to whatever was already selected, with no way back. A facet's `scope` is
 * applied — the ownership view should only offer ownership types.
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
        (e) =>
          new GetNameHistoryTimelineError({ cause: e as GraphqlRequestError }),
      ),
  })

// --------------------------------------------------------- auxiliary sources

/**
 * A child's registration is attributed to the parent on the full feed only — a
 * scoped view asked for specific types, and a subdomain `LabelRegistered` is
 * never one of them.
 *
 * `type_in` stays an inline literal: nested fields drop variable-supplied
 * arguments (see `TimelineEventFilter`).
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

/** What the paged connection cannot reach: v1 events and child registrations. */
const getNameHistoryAuxiliary = ResultFn(async function* ({
  name,
  eventTypes,
}: NameHistoryScope) {
  const client = yield* safeGetClient()
  const normalizedName = normalizeOrLower(name)
  const node = namehash(normalizedName)

  // Each source returns `[]` for a name the other owns; only a genuine failure rejects.
  const [children, v1Raw] = yield* fromPromise(
    Promise.all([
      eventTypes
        ? Promise.resolve({ events: [], saturated: false })
        : graphqlIndexerClient
            .request<{
              domains: {
                readonly subdomains?: readonly {
                  readonly events: readonly TimelineIndexerEvent[]
                }[]
              }[]
            }>(childRegistrationsQuery, { name: normalizedName })
            .then(({ domains: [domain] }) => {
              const subdomains = domain?.subdomains ?? []
              return {
                events: subdomains.flatMap(({ events }) => events),
                saturated: subdomains.length >= HISTORY_TIMELINE_CHILD_LIMIT,
              }
            }),
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

  // The v1 subgraph records no emitting address, so the badge is rebuilt from these.
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
    events: [...v1Events, ...children.events],
    // Every bounded whole-read source folds in here. A source that hit its cap
    // makes the event total a lower bound, so the view must not print it as
    // exact — see `totalCount` in `useHistoryTimeline`.
    isTruncated: v1Raw.saturated || children.saturated,
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
