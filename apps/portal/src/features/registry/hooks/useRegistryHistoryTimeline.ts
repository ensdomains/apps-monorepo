import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  TIMELINE_EVENT_FRAGMENT,
  type TimelineIndexerEvent,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryHistoryTimelineError extends TaggedError(
  'GetRegistryHistoryTimelineError',
)<{
  cause: ClientError
}> {}

type GetRegistryHistoryTimelineParameters = {
  readonly address: Address
  readonly orderDirection?: 'asc' | 'desc'
}

const EVENTS_LIMIT = 50

const getRegistryHistoryTimeline = ResultFn(async function* ({
  address,
  orderDirection = 'desc',
}: GetRegistryHistoryTimelineParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        eventConnection: { edges: { node: TimelineIndexerEvent }[] }
      } | null
    }>(
      gql`
        ${TIMELINE_EVENT_FRAGMENT}

        query getRegistryHistoryTimeline(
          $address: String!
          $first: Int
          $orderDirection: OrderDirection
        ) {
          registry(address: $address) {
            eventConnection(
              first: $first
              orderBy: timestamp
              orderDirection: $orderDirection
            ) {
              edges {
                node {
                  ...TimelineEvent
                }
              }
            }
          }
        }
      `,
      { address: address.toLowerCase(), first: EVENTS_LIMIT, orderDirection },
    ),
    (e) => new GetRegistryHistoryTimelineError({ cause: e as ClientError }),
  )

  // null = the indexer has no record for this address (not a registry, or not
  // yet indexed) — an empty timeline, not an error.
  const events = registry?.eventConnection.edges.map(({ node }) => node) ?? []

  return ok({
    events,
    // Unlike the name timeline this is not truncated to whole transactions —
    // the connection is already one contract's own feed — so a saturated
    // window is the only signal that history was left behind.
    hasMore: events.length >= EVENTS_LIMIT,
  })
})

const getRegistryHistoryTimelineQueryKey = createQueryKey<
  'get-registry-history-timeline',
  GetRegistryHistoryTimelineParameters
>('get-registry-history-timeline')

/**
 * Widened per-registry history query for the timeline.
 *
 * The registry counterpart of `getNameHistoryTimelineQueryOptions`: same
 * `TimelineEvent` selection (raw `data` blob plus every typed `as*` decoder),
 * but keyed on the registry *contract* rather than a name, so it returns what
 * the contract emitted about all of its labels — subname registrations,
 * subregistry links, role grants — not one name's slice of them.
 *
 * There is no v1 counterpart to merge in: registries are an ENSv2 contract, so
 * a v1 name has no registry for this to describe (see `V2RegistryInfo`).
 */
export const getRegistryHistoryTimelineQueryOptions = (
  params: GetRegistryHistoryTimelineParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryHistoryTimelineQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryHistoryTimeline(params),
  })
