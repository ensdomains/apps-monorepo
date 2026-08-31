import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { gql } from '@urql/core'
import { fromPromise } from 'neverthrow'
import { graphqlIndexerClient } from '@/lib/indexer'
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
 * Events fetched per request. Bounds one request, not the feed — `after` is what
 * reaches the rest.
 *
 * Purely a fetch-tuning number: nothing user-facing quotes it, because what a
 * page *renders* is this plus whatever auxiliary events the new horizon
 * uncovers (see `TimelineLoadMore`).
 *
 * Measured rather than picked: halving it to 50 left time-to-first-row
 * unchanged (2831ms vs 2851ms, medians of 3) because first paint is bound by
 * round-trip latency and the parallel v1/anchor/type reads, not by this
 * payload — so a smaller page only costs extra clicks.
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
 * Fetch one page of a cursor-paginated event feed.
 *
 * Deliberately does not chase a page whose boundary trim empties it — every
 * event sharing one timestamp, i.e. a single block filling the whole page.
 * That would be a network workaround for a rendering problem: the view offers
 * "Load more" whenever the feed has another page, so an empty page is a click
 * away from resolving itself rather than a dead end. Measured against staging,
 * the busiest block holds 16 events against a page of 100.
 */
export const fetchTimelineEventPage = requestPage
