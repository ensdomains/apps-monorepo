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
 * Over-fetch so that dropping the unfinished trailing block still leaves a full
 * feed, and a second request is rarely needed.
 */
const PAGE_SIZE = EVENTS_LIMIT * 3

/**
 * Ceiling on requests per load. Only reached if every page fetched so far is one
 * unbroken block, which takes a block emitting `PAGE_SIZE * MAX_PAGES`
 * protocol-wide events — at which point a partial feed beats hammering the
 * indexer.
 */
const MAX_PAGES = 3

type EventConnection = {
  eventConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    edges: { node: TimelineIndexerEvent }[]
  }
}

const recentActivityQuery = gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query getRecentActivityTimeline($first: Int, $after: String) {
    eventConnection(
      first: $first
      after: $after
      orderBy: timestamp
      orderDirection: desc
      where: { type_not_in: ${JSON.stringify([...IGNORED_TYPES])} }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...TimelineEvent
        }
      }
    }
  }
`

const requestPage = (after?: string) =>
  fromPromise(
    graphqlIndexerClient
      .request<EventConnection>(recentActivityQuery, {
        first: PAGE_SIZE,
        after,
      })
      .then(({ eventConnection }) => eventConnection),
    (e) => new GetRecentActivityTimelineError({ cause: e as ClientError }),
  )

const getRecentActivityTimeline = ResultFn(async function* () {
  const events: TimelineIndexerEvent[] = []
  let cursor: string | undefined
  let hasMore = true

  // Fetch until enough events survive the boundary trim. A page can be entirely
  // one block, in which case all of it is unfinished and the next page is what
  // completes it.
  for (let page = 0; page < MAX_PAGES; page++) {
    const { pageInfo, edges } = yield* requestPage(cursor)
    events.push(...edges.map((edge) => edge.node))
    hasMore = pageInfo.hasNextPage
    cursor = pageInfo.endCursor ?? undefined

    if (!hasMore || dropClippedBoundary(events, hasMore).length >= EVENTS_LIMIT)
      break
  }

  // Trimming removes everything when the paging cap is hit and all of it is
  // still one block. Nothing there is provably complete — the block continues
  // past what we fetched — so the choice is a possibly-clipped feed or an empty
  // one, and an empty Recent Activity during the busiest block the protocol has
  // ever had is the worse answer. Shows the newest transactions instead, of
  // which at most the last is partial.
  const trimmed = dropClippedBoundary(events, hasMore)

  return ok(
    truncateToTransactions(trimmed.length > 0 ? trimmed : events, EVENTS_LIMIT),
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
