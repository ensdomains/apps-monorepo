import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
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

class GetRecentActivityError extends TaggedError('GetRecentActivityError')<{
  cause: GraphqlRequestError
}> {}

const RECENT_ACTIVITY_LIMIT = 15

/**
 * The newest protocol-wide events, one row each. Read off the top-level
 * connection because it is the only one that honours `first`/`orderBy`
 * (see `timelineEventPage.ts`); the types the timeline never renders are
 * excluded in the query so they don't eat into the limit.
 */
const recentActivityQuery = gql`
  query getRecentActivity($first: Int, $where: EventFilter) {
    eventConnection(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: $where
    ) {
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

const getRecentActivity = () =>
  fromPromise(
    graphqlIndexerClient.request<{
      readonly eventConnection: {
        readonly edges: readonly { readonly node: RecentActivityEvent }[]
      } | null
    }>(recentActivityQuery, {
      first: RECENT_ACTIVITY_LIMIT,
      where: { type_not_in: [...IGNORED_TYPES] },
    }),
    (e) => new GetRecentActivityError({ cause: e as GraphqlRequestError }),
  ).map(
    ({ eventConnection }) =>
      eventConnection?.edges.map(({ node }) => node) ?? [],
  )

const getRecentActivityQueryKey = createQueryKey<
  'get-recent-activity',
  Record<never, never>
>('get-recent-activity')

export const getRecentActivityQueryOptions = () =>
  resultQueryOptions({
    queryKey: getRecentActivityQueryKey({}),
    queryFn: () => getRecentActivity(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
