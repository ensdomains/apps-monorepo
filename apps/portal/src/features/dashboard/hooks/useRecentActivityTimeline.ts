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
 * A protocol-wide transaction bundles several events (a registration emits
 * `NameRegistered` + `LabelRegistered` + `Transfer` + `EACRolesChanged` +
 * `ResolverUpdated`), and the timeline draws one row per transaction — so this
 * window is roughly a dozen rows, not fifty.
 */
const EVENTS_LIMIT = 50

/**
 * Types the timeline never renders are excluded in the query rather than after
 * the fetch: on the global feed they are the bulk of the events (every
 * registration is preceded by a `CommitmentMade`), so filtering client-side
 * would spend most of the window on rows that are then dropped.
 *
 * Inlined into the query text rather than passed as a variable — this indexer
 * drops a `where` whose value arrives via variables (see
 * `buildHistoryTimelineQuery`). Safe because the value is a module constant,
 * never caller input.
 */
const RECENT_ACTIVITY_QUERY = gql`
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
`

const getRecentActivityTimeline = ResultFn(async function* () {
  const { events } = yield* fromPromise(
    graphqlIndexerClient.request<{ events: TimelineIndexerEvent[] }>(
      RECENT_ACTIVITY_QUERY,
      { first: EVENTS_LIMIT },
    ),
    (e) => new GetRecentActivityTimelineError({ cause: e as ClientError }),
  )

  // A cutoff landing inside a transaction would headline that row from a subset
  // of its events, so drop the partial transaction at the boundary.
  const kept = truncateToTransactions(events, EVENTS_LIMIT)

  return ok({
    events: kept,
    // Read off the fetched window, not `kept`: truncating on a transaction
    // boundary routinely returns fewer than the limit from a window that was in
    // fact full, so `kept.length` would under-report.
    hasMore: events.length >= EVENTS_LIMIT,
  })
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
