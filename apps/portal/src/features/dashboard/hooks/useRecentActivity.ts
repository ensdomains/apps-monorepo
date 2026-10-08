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

/** One page of the protocol-wide feed. */
export type RecentActivityPage = {
  readonly events: readonly RecentActivityEvent[]
  readonly totalCount: number | undefined
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

class GetRecentActivityError extends TaggedError('GetRecentActivityError')<{
  cause: GraphqlRequestError
}> {}

export const RECENT_ACTIVITY_PAGE_SIZE = 15

/** Only the top-level connection honours `first`/`after`/`orderBy` (see `timelineEventPage.ts`). */
const recentActivityQuery = gql`
  query getRecentActivity($first: Int, $after: String, $where: EventFilter) {
    eventConnection(
      first: $first
      after: $after
      orderBy: timestamp
      orderDirection: desc
      where: $where
    ) {
      totalCount
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
        readonly totalCount: number | null
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
      totalCount: eventConnection?.totalCount ?? undefined,
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
    // A null `endCursor` must stop paging, or page one refetches forever.
    getNextPageParam: (last: RecentActivityPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
    // Polling refetches every loaded page, so it stops once the reader pages on.
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 0) > 1 ? false : 30_000,
    staleTime: 15_000,
  })
