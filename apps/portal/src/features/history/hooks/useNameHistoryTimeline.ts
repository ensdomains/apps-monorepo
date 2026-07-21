import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Hex } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

/**
 * Widened per-name history query for the timeline.
 *
 * Unlike `getV2NameHistoryQueryOptions` (which selects only type/tx/timestamp/block),
 * this selects the emitting `contractAddress`, the raw `data` blob, and every typed
 * `as*` decoder the indexer exposes — everything the summarize engine needs to build
 * human-readable action labels and decoded-param detail views.
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
  readonly contractAddress?: string | null
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

const HISTORY_TIMELINE_QUERY = gql`
  query getNameHistoryTimeline(
    $name: String!
    $first: Int
    $orderDirection: OrderDirection
  ) {
    domains(where: { name: $name }) {
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
  first = 100,
  orderDirection = 'desc',
}: GetNameHistoryTimelineParameters) {
  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<{ domains: DomainWithEvents[] }>(
      HISTORY_TIMELINE_QUERY,
      { name: name.toLowerCase(), first, orderDirection },
    ),
    (e) => new GetNameHistoryTimelineError({ cause: e as ClientError }),
  )

  return ok(domains[0]?.events ?? [])
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
