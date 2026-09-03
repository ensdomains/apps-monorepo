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

/** One page of a cursor-paginated event feed, whichever connection produced it. */
export type TimelinePage = {
  readonly events: readonly TimelineIndexerEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
  /** Events matching the filter across every page, as counted by the indexer. */
  readonly totalCount: number | undefined
}

/**
 * Cursor plumbing shared by every paginated timeline feed.
 *
 * `initialPageParam` is annotated rather than left bare because TanStack infers
 * the page-param type from it; plain `undefined` would reject the `after` it is
 * threaded into. Falling back to `undefined` when `endCursor` is null stops a
 * connection that claims `hasNextPage` from refetching page one forever.
 */
export const timelinePageParams = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: TimelinePage) =>
    last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
}

/**
 * Events per request. Halving it to 50 left time-to-first-row unchanged
 * (2831ms vs 2851ms) — first paint is bound by round-trip latency, not this
 * payload — so a smaller page would only cost extra clicks.
 */
export const HISTORY_TIMELINE_PAGE_SIZE = 100

/**
 * Only the *top-level* `eventConnection` honours variable-supplied arguments.
 * Every nested connection silently drops them — `domains { events(where: $w) }`
 * returned the unfiltered feed, and `registry { eventConnection(first:, after:) }`
 * served the default page size and repeated page one. No errors, just wrong data.
 * Hence every paginated feed here reads off the top-level connection and
 * addresses its subject through `where`.
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
 * A page whose boundary trim empties it (one block filling the page) is left
 * alone rather than chased with more requests: the view offers "Load more"
 * whenever the feed has another page. Staging's busiest block holds 16 events.
 */
export const fetchTimelineEventPage = requestPage
