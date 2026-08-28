import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { graphqlIndexerClient } from '@/lib/indexer'
import { dropClippedBoundary } from './dropClippedBoundary'
import {
  TIMELINE_EVENT_FRAGMENT,
  type TimelineIndexerEvent,
} from './timelineEvent'

class GetTimelineEventPageError extends TaggedError(
  'GetTimelineEventPageError',
)<{
  cause: GraphqlRequestError
}> {}

/**
 * One page of a cursor-paginated event feed, normalized away from whichever
 * `eventConnection` produced it — the protocol-wide one, a name's, or a
 * registry's.
 */
export type TimelinePage = {
  readonly events: readonly TimelineIndexerEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
  /**
   * How many events match the page's filter, across every page. The indexer
   * computes this against the same `where`, so it stays truthful under a scope
   * or a date range — unlike a count taken from the loaded events.
   */
  readonly totalCount: number | undefined
}

/**
 * The cursor plumbing every paginated timeline feed shares.
 *
 * `getNextPageParam` returning `undefined` is what tells TanStack there is no
 * next page, so a connection that reports `hasNextPage` without an `endCursor`
 * stops rather than refetching page one forever.
 *
 * `initialPageParam` is annotated rather than left bare because TanStack infers
 * the page-param type from it: plain `undefined` would type the cursor as
 * `undefined` and reject the `after` it is threaded into.
 */
export const timelinePageParams = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: TimelinePage) =>
    last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
}

/**
 * The default page size, and the figure the History page's break row quotes:
 * "Load 100 more events". It bounds one request, not the feed — `after` is what
 * reaches the rest.
 */
export const HISTORY_TIMELINE_PAGE_SIZE = 100

/**
 * `EventFilter` as the indexer defines it, narrowed to the inputs the timeline
 * uses.
 *
 * Passed as a GraphQL *variable*, which only the top-level `eventConnection`
 * handles. Every *nested* connection on this indexer silently drops its
 * variable-supplied arguments — verified against staging:
 * `domains { events(where: $w) }` returned the unfiltered feed, and
 * `registry { eventConnection(first: $n, after: $c) }` ignored both, serving the
 * default page size and repeating page one. No errors in either case, just
 * wrong data. Anything nested has to inline its arguments as literals, which is
 * why the timeline reads every paginated feed off the top-level connection and
 * addresses the subject through `where` instead.
 */
export type TimelineEventFilter = {
  readonly namehash?: string
  /** The emitting contract — how a registry's own feed is addressed. */
  readonly contractAddress?: string
  readonly type_in?: readonly string[]
  readonly type_not_in?: readonly string[]
  readonly timestamp_gte?: number
  readonly timestamp_lte?: number
}

const timelineEventPageQuery = gql`
  ${TIMELINE_EVENT_FRAGMENT}

  query getTimelineEventPage(
    $where: EventFilter
    $first: Int
    $after: String
    $orderDirection: OrderDirection
  ) {
    eventConnection(
      first: $first
      after: $after
      orderBy: timestamp
      orderDirection: $orderDirection
      where: $where
    ) {
      totalCount
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

type FetchTimelineEventPageParameters = {
  readonly where?: TimelineEventFilter
  readonly first?: number
  readonly after?: string
  readonly orderDirection?: 'asc' | 'desc'
}

const requestPage = ({
  where,
  first,
  after,
  orderDirection = 'desc',
}: FetchTimelineEventPageParameters) =>
  fromPromise(
    graphqlIndexerClient
      .request<{
        readonly eventConnection: {
          readonly pageInfo: {
            readonly hasNextPage: boolean
            readonly endCursor: string | null
          }
          readonly edges: readonly { readonly node: TimelineIndexerEvent }[]
          readonly totalCount?: number | null
        } | null
      }>(timelineEventPageQuery, { where, first, after, orderDirection })
      .then(
        ({ eventConnection }): TimelinePage => ({
          events: eventConnection?.edges.map(({ node }) => node) ?? [],
          endCursor: eventConnection?.pageInfo.endCursor ?? null,
          hasNextPage: eventConnection?.pageInfo.hasNextPage ?? false,
          totalCount: eventConnection?.totalCount ?? undefined,
        }),
      ),
    (e) => new GetTimelineEventPageError({ cause: e as GraphqlRequestError }),
  )

/**
 * How many extra requests one page may make before giving up on finding a whole
 * transaction.
 *
 * A page renders by transaction, so a page whose events are *all* one
 * unfinished transaction has nothing to show — the timeline would come up empty
 * beside a "Load more" row. Continuing reaches the rest of that transaction.
 *
 * This only fires for a single transaction emitting more than a page of ENS
 * events, e.g. a bulk multicall setting 100+ records. It is not a general
 * over-fetch: the ordinary page holds many transactions, so the boundary trim
 * always leaves something and exactly one request is made.
 */
const MAX_CONTINUATIONS = 2

/**
 * Fetch one page of a cursor-paginated event feed, continuing only while the
 * page holds no complete transaction.
 *
 * The accumulated events come back under the *last* response's cursor and
 * `hasNextPage`, so the result still behaves as a single page to its caller and
 * composes with `getNextTimelinePageParam` unchanged.
 */
export const fetchTimelineEventPage = ResultFn(async function* (
  params: FetchTimelineEventPageParameters,
) {
  let page = yield* requestPage(params)

  for (
    let attempt = 0;
    attempt < MAX_CONTINUATIONS &&
    page.hasNextPage &&
    dropClippedBoundary(page.events, page.hasNextPage).length === 0;
    attempt++
  ) {
    const continuation = yield* requestPage({
      ...params,
      after: page.endCursor ?? undefined,
    })
    page = {
      events: [...page.events, ...continuation.events],
      endCursor: continuation.endCursor,
      hasNextPage: continuation.hasNextPage,
      totalCount: continuation.totalCount ?? page.totalCount,
    }
  }

  return ok(page)
})
