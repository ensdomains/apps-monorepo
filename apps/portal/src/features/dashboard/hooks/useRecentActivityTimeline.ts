import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import {
  TIMELINE_EVENT_FRAGMENT,
  type TimelineIndexerEvent,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { IGNORED_TYPES } from '@/features/history/summarize/summarizeEvents'
import { truncateToTransactions } from '@/features/history/truncateToTransactions'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRecentActivityTimelineError extends TaggedError(
  'GetRecentActivityTimelineError',
)<{
  cause: ClientError
}> {}

/**
 * Counts events, and one transaction bundles several of them (a registration
 * emits five), so this window is roughly a dozen timeline rows, not fifty.
 */
const EVENTS_LIMIT = 50

const getRecentActivityTimeline = ResultFn(async function* () {
  const { events } = yield* fromPromise(
    graphqlIndexerClient.request<{ events: TimelineIndexerEvent[] }>(
      gql`
        ${TIMELINE_EVENT_FRAGMENT}

        query getRecentActivityTimeline($first: Int) {
          events(
            first: $first
            orderBy: timestamp
            orderDirection: desc
            where: { type_not_in: ${JSON.stringify([...IGNORED_TYPES])} }
          ) {
            ...TimelineEvent
          }
        }
      `,
      { first: EVENTS_LIMIT },
    ),
    (e) => new GetRecentActivityTimelineError({ cause: e as ClientError }),
  )

  // Types the timeline drops are excluded in the query because on the global
  // feed they are most of the events (every registration is preceded by a
  // `CommitmentMade`) — filtering after the fetch would spend the window on
  // rows that never render. The filter is inlined into the query text rather
  // than passed as a variable: this indexer drops a `where` that arrives via
  // variables (see `buildHistoryTimelineQuery`).
  //
  // The window then has to be trimmed on a transaction boundary, or the row at
  // the cutoff would be headlined from a subset of its events.
  return ok(truncateToTransactions(events, EVENTS_LIMIT))
})

const getRecentActivityTimelineQueryKey = createQueryKey<
  'get-recent-activity-timeline',
  Record<never, never>
>('get-recent-activity-timeline')

/**
 * The protocol-wide event feed behind the homepage's Recent Activity timeline.
 *
 * Unkeyed, unlike `getNameHistoryTimelineQueryOptions` and
 * `getRegistryHistoryTimelineQueryOptions`: it reads the indexer's root `events`
 * field, so its rows have many different subjects — which is why the timeline
 * renders it with `includeSubjectName`.
 *
 * v2-only. There is no v1 subgraph counterpart to merge in: the per-name query
 * can ask the subgraph about one namehash, but a protocol-wide feed would mean
 * interleaving two unbounded windows on timestamps the v1 subgraph doesn't even
 * record (see `adaptV1Events`).
 */
export const getRecentActivityTimelineQueryOptions = () =>
  resultQueryOptions({
    queryKey: getRecentActivityTimelineQueryKey({}),
    queryFn: () => getRecentActivityTimeline(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
