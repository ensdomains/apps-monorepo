import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { namehash, normalize } from 'viem/ens'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { graphqlIndexerClient } from '@/lib/indexer'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { mergeTimeline } from '../mergeTimeline'
import { adaptV1Events } from '../v1/adaptV1Events'
import { fetchV1NameHistory } from '../v1/fetchV1NameHistory'

/**
 * Widened per-name history query for the timeline.
 *
 * Unlike `getV2NameHistoryQueryOptions` (which selects only type/tx/timestamp/block),
 * this selects the emitting `contractAddress`, the raw `data` blob, and every typed
 * `as*` decoder the indexer exposes — everything the summarize engine needs to build
 * human-readable action labels and decoded-param detail views.
 *
 * Events are read from BOTH protocols and merged: the v2 indexer has no `domains`
 * row at all for a name that never migrated, so a v1-only name would otherwise
 * render an empty timeline. v1 events are normalized to this same shape by
 * `v1/adaptV1Events.ts`.
 *
 * TODO(indexer): add `from` (tx sender) to `Event` so the "by {actor}" / "initiated by"
 * lines are first-class instead of RPC-backfilled (see useTransactionSenders).
 * TODO(indexer): add typed decoders for ContenthashChanged / NameChanged so those
 * actions don't rely on parsing the raw `data` JSON (see summarize/decodeRawData.ts).
 */

class GetNameHistoryTimelineError extends TaggedError(
  'GetNameHistoryTimelineError',
)<{
  cause: ClientError
}> {}

/**
 * On-chain integer params. The v2 indexer sends these as JSON numbers, but v1
 * values are adapted from subgraph strings and must not round-trip through
 * `Number` — a uint64 expiry or uint256 coin type exceeds
 * `Number.MAX_SAFE_INTEGER`. Nothing does arithmetic on them; they are
 * stringified for the decoded-param table, which handles either.
 */
type OnChainInt = number | bigint | null

export type TimelineDecoded = {
  readonly asAddressChanged?: {
    address?: string | null
    coinType?: OnChainInt
    resolver?: string | null
    namehash?: string | null
  } | null
  readonly asTextChanged?: {
    key?: string | null
    value?: string | null
    resolver?: string | null
    namehash?: string | null
  } | null
  readonly asTransfer?: {
    from?: string | null
    to?: string | null
    id?: string | null
    operator?: string | null
    value?: string | null
  } | null
  readonly asRegistryTransfer?: {
    node?: string | null
    owner?: string | null
  } | null
  readonly asLabelRegistered?: {
    name?: string | null
    owner?: string | null
    registry?: string | null
    tokenId?: string | null
    sender?: string | null
    canonicalId?: string | null
    expiry?: OnChainInt
  } | null
  readonly asNameRegistered?: {
    name?: string | null
    label?: string | null
    owner?: string | null
    cost?: string | null
    baseCost?: string | null
    premium?: string | null
    referrer?: string | null
    expires?: OnChainInt
  } | null
  readonly asNameRenewed?: {
    id?: string | null
    expires?: OnChainInt
  } | null
  readonly asResolverUpdated?: {
    resolver?: string | null
    sender?: string | null
    tokenId?: string | null
  } | null
  readonly asReverseClaimed?: {
    address?: string | null
    node?: string | null
  } | null
  readonly asNameWrapped?: {
    node?: string | null
    owner?: string | null
    fuses?: OnChainInt
    expiry?: OnChainInt
  } | null
  readonly asNameUnwrapped?: {
    node?: string | null
    owner?: string | null
  } | null
  readonly asFusesSet?: { node?: string | null; fuses?: OnChainInt } | null
  readonly asExpiryUpdated?: {
    node?: string | null
    tokenId?: string | null
    expiry?: OnChainInt
  } | null
}

export type TimelineIndexerEvent = TimelineDecoded & {
  readonly id: string
  readonly type: string
  readonly name?: string | null
  readonly namehash?: string | null
  readonly protocol?: string | null
  readonly transactionHash: Hex
  readonly blockNumber: number
  readonly timestamp: number
  readonly contractAddress?: Address | null
  readonly key?: string | null
  readonly value?: string | null
  /** Raw JSON blob of decoded params — fallback for event types without an `as*` decoder. */
  readonly data?: string | null
}

type GetNameHistoryTimelineParameters = {
  readonly name: string
  readonly first?: number
  readonly orderDirection?: 'asc' | 'desc'
  /**
   * Restrict the feed to these event types, for the per-facet views (address
   * resolution, ownership, …).
   *
   * This has to be applied in the query, not client-side: `first` bounds the
   * *whole* feed, so a name with a lot of unrelated churn (fox.eth has 66
   * `TextChanged`) pushes its handful of address events out of the window
   * before any client-side filter gets to see them.
   */
  readonly eventTypes?: readonly string[]
}

type DomainWithEvents = { events: TimelineIndexerEvent[] }

export const V1_PROTOCOL = 'v1'

export const HISTORY_TIMELINE_PAGE_SIZE = 100

/**
 * Direct children come from `subdomains`, not a `name_ends_with` suffix match:
 * the suffix also matches every deeper descendant, so `a.b.leon.eth` would land
 * in `leon.eth`'s timeline.
 *
 * `first` is passed explicitly so the page size is ours: omitting it falls back
 * to the indexer's own default (10 at time of writing), which can change
 * server-side without a deploy here.
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
 * The event-type filter has to be inlined into the query text rather than
 * passed as a variable: this indexer silently DROPS a `where` on the nested
 * `events` field when its value arrives via variables (verified against
 * staging for a list variable, a scalar variable and a whole-`EventFilter`
 * variable — all returned the unfiltered feed, no error). Inline literals
 * filter correctly, which is why the `subdomains` selection below already
 * spells its own `type_in` out longhand.
 *
 * The values are our own constants, never user input.
 */
const TIMELINE_EVENT_FRAGMENT = `  fragment TimelineEvent on Event {
    id
    type
    name
    namehash
    protocol
    transactionHash
    blockNumber
    timestamp
    contractAddress
    key
    value
    data
    asAddressChanged { address coinType resolver namehash }
    asTextChanged { key value resolver namehash }
    asTransfer { from to id operator value }
    asRegistryTransfer { node owner }
    asLabelRegistered { name owner registry tokenId sender canonicalId expiry }
    asNameRegistered { name label owner cost baseCost premium referrer expires }
    asNameRenewed { id expires }
    asResolverUpdated { resolver sender tokenId }
    asReverseClaimed { address node }
    asNameWrapped { node owner fuses expiry }
    asNameUnwrapped { node owner }
    asFusesSet { node fuses }
    asExpiryUpdated { node tokenId expiry }
  }`

const buildHistoryTimelineQuery = (eventTypes?: readonly string[]) => gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query getNameHistoryTimeline(
    $name: String!
    $first: Int
    $orderDirection: OrderDirection
  ) {
    domains(where: { name: $name }, first: 1) {
      eventsCount
      events(first: $first, orderBy: timestamp, orderDirection: $orderDirection ${eventTypes ? `where: { type_in: ${JSON.stringify(eventTypes)} }` : ''}) {
        ...TimelineEvent
      }
      ${
        // A child's registration is attributed to the parent on the full feed
        // only. A scoped view asked for specific event types, and a subdomain
        // `LabelRegistered` is never one of them — it has its own `type_in`, so
        // it would otherwise slip past the scope filter entirely.
        eventTypes
          ? ''
          : `subdomains(first: ${HISTORY_TIMELINE_CHILD_LIMIT}) {
        events(
          first: 1
          orderBy: timestamp
          orderDirection: asc
          where: { type_in: ["LabelRegistered"] }
        ) {
          ...TimelineEvent
        }
      }`
      }
    }
  }
`

/**
 * Complete events for the blocks a scoped read matched, unscoped.
 *
 * A scoped query answers "which transactions touched these types", but its rows
 * must still describe the *whole* transaction — the label, the event count and
 * the expanded detail all read from `action.events`, so summarizing from the
 * scoped subset alone would state things that aren't true of the transaction.
 *
 * The blocks come from the scoped pass and every event of a transaction shares
 * one, so this is bounded by the transactions actually shown. It has to run
 * against the root `events` field: the nested `domain.events` selection honours
 * `type_in` and silently ignores every other filter (verified against staging
 * for `blockNumber_gte/lte` and `or` — both returned the unfiltered feed).
 */
const buildHydrationQuery = (blocks: readonly number[]) => gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query hydrateTimelineTransactions($namehash: String!) {
    events(
      first: ${HISTORY_TIMELINE_PAGE_SIZE}
      orderBy: timestamp
      orderDirection: desc
      where: {
        namehash: $namehash
        or: [${blocks
          .map(
            (block) =>
              `{ blockNumber_gte: ${block}, blockNumber_lte: ${block} }`,
          )
          .join(', ')}]
      }
    ) {
      ...TimelineEvent
    }
  }
`

/**
 * Re-read the transactions a scoped pass matched, with every event they contain.
 *
 * Keeps only the matched transactions — the scope still decides which rows
 * appear — but each one is now complete, so label, event count and expanded
 * detail all describe the real transaction.
 */
const hydrateTransactions = ResultFn(async function* ({
  scoped,
  name,
  namehash: node,
  subgraphUrl,
  contracts,
}: {
  readonly scoped: readonly TimelineIndexerEvent[]
  readonly name: string
  readonly namehash: Hex
  readonly subgraphUrl: string
  readonly contracts: Parameters<typeof adaptV1Events>[0]['contracts']
}) {
  if (scoped.length === 0) return ok([] as TimelineIndexerEvent[])

  const wanted = new Set(
    scoped.map((event) => event.transactionHash.toLowerCase()),
  )
  const v2Blocks = [
    ...new Set(
      scoped
        .filter((event) => event.protocol !== V1_PROTOCOL)
        .map((event) => event.blockNumber),
    ),
  ]
  const v1TransactionIds = [
    ...new Set(
      scoped
        .filter((event) => event.protocol === V1_PROTOCOL)
        .map((event) => event.transactionHash),
    ),
  ]

  const [v2Full, v1Raw] = yield* fromPromise(
    Promise.all([
      v2Blocks.length === 0
        ? Promise.resolve<TimelineIndexerEvent[]>([])
        : graphqlIndexerClient
            .request<{ events: TimelineIndexerEvent[] }>(
              buildHydrationQuery(v2Blocks),
              { namehash: node },
            )
            .then(({ events }) => events),
      v1TransactionIds.length === 0
        ? Promise.resolve([])
        : fetchV1NameHistory({
            subgraphUrl,
            namehash: node,
            first: HISTORY_TIMELINE_PAGE_SIZE,
            orderDirection: 'desc',
            transactionIds: v1TransactionIds,
          }),
    ]),
    (e) => new GetNameHistoryTimelineError({ cause: e as ClientError }),
  )

  const v1Full =
    v1Raw.length === 0
      ? []
      : adaptV1Events({
          events: v1Raw,
          blockTimestamps: yield* getBlockTimestamps({
            blocks: v1Raw.map((event) => BigInt(event.blockNumber)),
          }),
          name,
          namehash: node,
          contracts,
        })

  // Blocks can hold more than the matched transaction, so narrow back down.
  return ok(
    [...v2Full, ...v1Full].filter((event) =>
      wanted.has(event.transactionHash.toLowerCase()),
    ),
  )
})

const getNameHistoryTimeline = ResultFn(async function* ({
  name,
  first = HISTORY_TIMELINE_PAGE_SIZE,
  orderDirection = 'desc',
  eventTypes,
}: GetNameHistoryTimelineParameters) {
  const client = yield* safeGetClient()
  const normalizedName = (() => {
    try {
      return normalize(name)
    } catch {
      return name.toLowerCase()
    }
  })()
  const node = namehash(normalizedName)

  // Each source returns `[]` for a name the other owns, so an empty result is
  // normal and only a genuine failure rejects — same all-or-nothing behaviour
  // the page had before the timeline.
  const [v2Result, v1Raw] = yield* fromPromise(
    Promise.all([
      graphqlIndexerClient
        .request<{
          domains: (DomainWithEvents & {
            eventsCount: number
            subdomains?: DomainWithEvents[]
          })[]
        }>(buildHistoryTimelineQuery(eventTypes), {
          name: normalizedName,
          first,
          orderDirection,
        })
        .then(({ domains: [domain] }) => {
          if (!domain) return { events: [], eventsCount: 0 }
          // A child's registration can also be attributed to the parent.
          const seen = new Set(domain.events.map((event) => event.id))
          return {
            events: [
              ...domain.events,
              ...(domain.subdomains ?? [])
                .flatMap(({ events }) => events)
                .filter((event) => !seen.has(event.id)),
            ],
            eventsCount: domain.eventsCount,
          }
        }),
      fetchV1NameHistory({
        subgraphUrl: client.chain.subgraphs.ens.url,
        namehash: node,
        first,
        orderDirection,
        eventTypes,
      }),
    ]),
    (e) => new GetNameHistoryTimelineError({ cause: e as ClientError }),
  )

  // v1 events carry no timestamp; the timeline sorts and dates on one.
  const blockTimestamps = yield* getBlockTimestamps({
    blocks: v1Raw.map((event) => BigInt(event.blockNumber)),
  })

  // Static chain constants, not lookups — the v1 subgraph records no emitting
  // address, so the contract badge is reconstructed from these.
  const v1Contracts = {
    registry: client.chain.contracts.ensRegistry.address,
    nameWrapper: client.chain.contracts.ensNameWrapper.address,
    baseRegistrar:
      client.chain.contracts.ensBaseRegistrarImplementation.address,
  }

  const v1EventsAll = adaptV1Events({
    events: v1Raw,
    blockTimestamps,
    name: normalizedName,
    namehash: node,
    contracts: v1Contracts,
  })

  // `fetchV1NameHistory` scopes resolver events in the query, but domain and
  // registration events share one unscoped window, so they are dropped here.
  // This runs after adapting because `adaptV1Events` is what renames some v1
  // types into their v2 equivalents — filtering earlier would compare against
  // the wrong vocabulary.
  const v1Events = eventTypes
    ? v1EventsAll.filter((event) => eventTypes.includes(event.type))
    : v1EventsAll

  const timeline = mergeTimeline({
    v2Events: v2Result.events,
    v1Events,
    first,
    orderDirection,
    eventsCount: v2Result.eventsCount,
  })

  if (!eventTypes) return ok(timeline)

  // A scoped read has selected only the matching events, so each transaction is
  // present but incomplete. Re-read those transactions in full before they are
  // summarized, or the row would describe a subset: "Set 2 records / 2 events"
  // for a transaction that actually set five.
  //
  // The completeness flags stay as `mergeTimeline` computed them: hydration
  // fills in the transactions already kept, it does not reach further back, so
  // deriving `hasMore` from the hydrated count would compare a padded window
  // against the merge that produced it.
  const hydrated = yield* hydrateTransactions({
    scoped: timeline.events,
    name: normalizedName,
    namehash: node,
    subgraphUrl: client.chain.subgraphs.ens.url,
    contracts: v1Contracts,
  })

  return ok({
    ...timeline,
    events: hydrated.sort((a, b) => b.timestamp - a.timestamp),
  })
})

const getNameHistoryTimelineQueryKey = createQueryKey<
  'get-name-history-timeline',
  GetNameHistoryTimelineParameters
>('get-name-history-timeline')

export const getNameHistoryTimelineQueryOptions = (
  params: GetNameHistoryTimelineParameters,
) =>
  resultQueryOptions({
    queryKey: getNameHistoryTimelineQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameHistoryTimeline(params),
  })
