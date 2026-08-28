import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { dropClippedBoundary } from '@/features/history/dropClippedBoundary'
import {
  TIMELINE_EVENT_FRAGMENT,
  type TimelineIndexerEvent,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { truncateToTransactions } from '@/features/history/truncateToTransactions'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryHistoryTimelineError extends TaggedError(
  'GetRegistryHistoryTimelineError',
)<{
  cause: ClientError
}> {}

type GetRegistryHistoryTimelineParameters = {
  readonly address: Address
}

const EVENTS_LIMIT = 50

const getRegistryHistoryTimeline = ResultFn(async function* ({
  address,
}: GetRegistryHistoryTimelineParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        eventConnection: {
          pageInfo: { hasNextPage: boolean }
          edges: { node: TimelineIndexerEvent }[]
        }
      } | null
    }>(
      gql`
        ${TIMELINE_EVENT_FRAGMENT}

        query getRegistryHistoryTimeline($address: String!, $first: Int) {
          registry(address: $address) {
            eventConnection(
              first: $first
              orderBy: timestamp
              orderDirection: desc
            ) {
              pageInfo {
                hasNextPage
              }
              edges {
                node {
                  ...TimelineEvent
                }
              }
            }
          }
        }
      `,
      { address: address.toLowerCase(), first: EVENTS_LIMIT },
    ),
    (e) => new GetRegistryHistoryTimelineError({ cause: e as ClientError }),
  )

  // null = the indexer has no record for this address (not a registry, or not
  // yet indexed) — an empty timeline, not an error.
  const events = registry?.eventConnection.edges.map(({ node }) => node) ?? []
  const hasMore = registry?.eventConnection.pageInfo.hasNextPage ?? false

  // The window is a count of events, but `summarizeEvents` groups by
  // transaction — and a registry emits several events per transaction
  // (LabelRegistered + Transfer + EACRolesChanged + ResolverUpdated for one
  // subname registration). The query cut can land inside one, so the trailing
  // block goes before the display cut is applied on transaction boundaries.
  const kept = truncateToTransactions(
    dropClippedBoundary(events, hasMore),
    EVENTS_LIMIT,
  )

  return ok({ events: kept, hasMore })
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
