import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { dropClippedBoundary } from '@/features/history/dropClippedBoundary'
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
 * `dropClippedBoundary` throws away the boundary block, and if that block is the
 * entire response there is nothing provably complete left to show — it then has
 * to hand back clipped transactions rather than nothing. Asking for several
 * times what we render means that only happens if one block alone produces
 * `FETCH_LIMIT` protocol-wide events, instead of merely `EVENTS_LIMIT`.
 */
const FETCH_LIMIT = EVENTS_LIMIT * 3

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
      { first: FETCH_LIMIT },
    ),
    (e) => new GetRecentActivityTimelineError({ cause: e as ClientError }),
  )

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
