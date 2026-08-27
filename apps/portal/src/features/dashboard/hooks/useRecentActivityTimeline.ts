import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import {
  clippedBoundaryTimestamp,
  dropClippedBoundary,
} from '@/features/history/dropClippedBoundary'
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

/** Events, not rows — a transaction bundles several, so this is ~10 rows. */
const EVENTS_LIMIT = 50

/**
 * Over-fetch so the trailing block can be discarded and still leave a full feed.
 *
 * `dropClippedBoundary` throws away the boundary block, so without slack the
 * feed would be shorter than `EVENTS_LIMIT` on most loads.
 */
const FETCH_LIMIT = EVENTS_LIMIT * 3

/**
 * Cap on the widening re-query, for the case where `FETCH_LIMIT` events all
 * share one timestamp and nothing can be shown to be complete.
 *
 * 1000 is the largest `first` the indexer accepts — it rejects anything above
 * that — which matters because the check for "did the widened query see the
 * whole group" is `length < BOUNDARY_LIMIT`. Were this set above the cap the
 * query would error; below it, a group between this and the cap would look
 * complete when it wasn't.
 */
const BOUNDARY_LIMIT = 1_000

const eventsQuery = gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query getRecentActivityTimeline($first: Int, $since: Int) {
    events(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: {
        type_not_in: ${JSON.stringify([...IGNORED_TYPES])}
        timestamp_gte: $since
      }
    ) {
      ...TimelineEvent
    }
  }
`

const requestEvents = (first: number, since?: number) =>
  fromPromise(
    graphqlIndexerClient
      .request<{ events: TimelineIndexerEvent[] }>(eventsQuery, {
        first,
        since,
      })
      .then(({ events }) => events),
    (e) => new GetRecentActivityTimelineError({ cause: e as ClientError }),
  )

const getRecentActivityTimeline = ResultFn(async function* () {
  const events = yield* requestEvents(FETCH_LIMIT)

  // Every event sharing one timestamp means the query boundary fell inside a
  // group we can't see the end of, so no transaction in it is provably whole.
  // Re-ask for that group alone: a short answer is the entire group, and then
  // nothing is clipped. A full one is still clipped, so keep the first page and
  // accept partial transactions rather than an empty feed.
  const boundary = clippedBoundaryTimestamp(events, FETCH_LIMIT)
  if (boundary !== undefined) {
    const group = yield* requestEvents(BOUNDARY_LIMIT, boundary)
    return ok(
      truncateToTransactions(
        group.length < BOUNDARY_LIMIT ? group : events,
        EVENTS_LIMIT,
      ),
    )
  }

  return ok(
    truncateToTransactions(
      dropClippedBoundary(events, FETCH_LIMIT),
      EVENTS_LIMIT,
    ),
  )
})

const getRecentActivityTimelineQueryKey = createQueryKey<
  'get-recent-activity-timeline',
  Record<never, never>
>('get-recent-activity-timeline')

/** The protocol-wide feed behind the homepage's Recent Activity. v2 only. */
export const getRecentActivityTimelineQueryOptions = () =>
  resultQueryOptions({
    queryKey: getRecentActivityTimelineQueryKey({}),
    queryFn: () => getRecentActivityTimeline(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
