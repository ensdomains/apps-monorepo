import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise } from 'neverthrow'
import type { Hash } from 'viem'
import { IGNORED_TYPES } from '@/features/history/summarize/summarizeEvents'
import { graphqlIndexerClient } from '@/lib/indexer'

export type RecentActivityEvent = {
  readonly name: string | null
  readonly type: string
  readonly transactionHash: Hash
  readonly timestamp: number
  readonly blockNumber: number
  readonly contractAddress: string
  readonly namehash: string | null
  readonly domain: { readonly name: string | null } | null
  readonly data: string | null
}

/** One page of the protocol-wide feed, as the table renders it. */
export type RecentActivityPage = {
  readonly events: readonly RecentActivityEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

class GetRecentActivityError extends TaggedError('GetRecentActivityError')<{
  cause: GraphqlRequestError
}> {}

const RECENT_ACTIVITY_PAGE_SIZE = 15

/**
 * The newest protocol-wide events, one row each. Read off the top-level
 * connection because it is the only one that honours `first`/`after`/`orderBy`
 * (see `timelineEventPage.ts`); the types the timeline never renders are
 * excluded in the query so they don't eat into the page.
 */
const recentActivityQuery = gql`
  query getRecentActivity($first: Int, $after: String, $where: EventFilter) {
    eventConnection(
      first: $first
      after: $after
      orderBy: timestamp
      orderDirection: desc
      where: $where
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          name
          type
          transactionHash
          timestamp
          blockNumber
          contractAddress
          namehash
          domain {
            name
          }
          data
        }
      }
    }
  }
`

const getRecentActivityPage = (after: string | undefined) =>
  fromPromise(
    graphqlIndexerClient.request<{
      readonly eventConnection: {
        readonly pageInfo: {
          readonly hasNextPage: boolean
          readonly endCursor: string | null
        }
        readonly edges: readonly { readonly node: RecentActivityEvent }[]
      } | null
    }>(recentActivityQuery, {
      first: RECENT_ACTIVITY_PAGE_SIZE,
      after,
      where: { type_not_in: [...IGNORED_TYPES] },
    }),
    (e) => new GetRecentActivityError({ cause: e as GraphqlRequestError }),
  ).map(
    ({ eventConnection }): RecentActivityPage => ({
      events: eventConnection?.edges.map(({ node }) => node) ?? [],
      endCursor: eventConnection?.pageInfo.endCursor ?? null,
      hasNextPage: eventConnection?.pageInfo.hasNextPage ?? false,
    }),
  )

const getRecentActivityQueryKey = createQueryKey<
  'get-recent-activity',
  Record<never, never>
>('get-recent-activity')

export const getRecentActivityQueryOptions = () =>
  resultInfiniteQueryOptions({
    queryKey: getRecentActivityQueryKey({}),
    queryFn: ({ pageParam }) => getRecentActivityPage(pageParam),
    initialPageParam: undefined as string | undefined,
    // Falling back to `undefined` when `endCursor` is null stops a connection
    // that claims `hasNextPage` from refetching page one forever.
    getNextPageParam: (last: RecentActivityPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
    // An infinite query refetches *every* loaded page in sequence, so a flat
    // interval costs N+1 requests every 30s after N "Load more" clicks. The
    // poll exists to bring new events in at the top; a reader who has paged
    // past the first page is no longer watching it, so it stops there.
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 0) > 1 ? false : 30_000,
    staleTime: 15_000,
  })
