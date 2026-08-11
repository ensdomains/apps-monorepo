import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { namehash, normalize } from 'viem/ens'
import { graphqlIndexerClient } from '@/lib/indexer'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { adaptV1Events } from '../v1/adaptV1Events'
import { fetchBlockTimestamps } from '../v1/fetchBlockTimestamps'
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

export type TimelineDecoded = {
  readonly asAddressChanged?: {
    address?: string | null
    coinType?: number | null
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
    expiry?: number | null
  } | null
  readonly asNameRegistered?: {
    name?: string | null
    label?: string | null
    owner?: string | null
    cost?: string | null
    baseCost?: string | null
    premium?: string | null
    referrer?: string | null
    expires?: number | null
  } | null
  readonly asNameRenewed?: {
    id?: string | null
    expires?: number | null
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
    fuses?: number | null
    expiry?: number | null
  } | null
  readonly asNameUnwrapped?: {
    node?: string | null
    owner?: string | null
  } | null
  readonly asFusesSet?: { node?: string | null; fuses?: number | null } | null
  readonly asExpiryUpdated?: {
    node?: string | null
    tokenId?: string | null
    expiry?: number | null
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
}

type DomainWithEvents = { events: TimelineIndexerEvent[] }

export const V1_PROTOCOL = 'v1'
export const V2_PROTOCOL = 'v2'

export const HISTORY_TIMELINE_PAGE_SIZE = 100

const HISTORY_TIMELINE_QUERY = gql`
  query getNameHistoryTimeline(
    $name: String!
    $first: Int
    $orderDirection: OrderDirection
  ) {
    domains(where: { name: $name }, first: 1) {
      events(first: $first, orderBy: timestamp, orderDirection: $orderDirection) {
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
      }
    }
  }
`

const getNameHistoryTimeline = ResultFn(async function* ({
  name,
  first = HISTORY_TIMELINE_PAGE_SIZE,
  orderDirection = 'desc',
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

  const [v2Result, v1Result] = yield* fromPromise(
    Promise.allSettled([
      graphqlIndexerClient
        .request<{ domains: DomainWithEvents[] }>(HISTORY_TIMELINE_QUERY, {
          name: normalizedName,
          first,
          orderDirection,
        })
        .then(({ domains }) => domains[0]?.events ?? []),

      fetchV1NameHistory({
        subgraphUrl: client.chain.subgraphs.ens.url,
        namehash: node,
        first,
        orderDirection,
      }).then(async (events) => ({
        events,
        blockTimestamps: await fetchBlockTimestamps(client, [
          ...new Set(events.map((event) => event.blockNumber)),
        ]),
      })),
    ]),
    (e) => new GetNameHistoryTimelineError({ cause: e as ClientError }),
  )

  if (v2Result.status === 'rejected' && v1Result.status === 'rejected') {
    return err(new GetNameHistoryTimelineError({ cause: v2Result.reason }))
  }

  const v2Events = v2Result.status === 'fulfilled' ? v2Result.value : []
  const v1 =
    v1Result.status === 'fulfilled'
      ? v1Result.value
      : { events: [], blockTimestamps: new Map<number, number>() }

  const v1Events = adaptV1Events({
    ...v1,
    name: normalizedName,
    namehash: node,
    // Static chain constants, not lookups — the v1 subgraph records no
    // emitting address, so the contract badge is reconstructed from these.
    contracts: {
      registry: client.chain.contracts.ensRegistry.address,
      nameWrapper: client.chain.contracts.ensNameWrapper.address,
      baseRegistrar:
        client.chain.contracts.ensBaseRegistrarImplementation.address,
    },
  })

  return ok({
    events: [...v2Events, ...v1Events]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, first),
    unavailable: [
      ...(v2Result.status === 'rejected' ? [V2_PROTOCOL] : []),
      ...(v1Result.status === 'rejected' ? [V1_PROTOCOL] : []),
    ],
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
