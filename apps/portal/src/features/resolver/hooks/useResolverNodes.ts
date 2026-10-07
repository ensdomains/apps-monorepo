import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import type { ResolverNode } from './useResolverOverview'

class GetResolverNodesError extends TaggedError('GetResolverNodesError')<{
  cause: GraphqlRequestError
}> {}

type GetResolverNodesParameters = {
  readonly address: Address
}

type ResolverNodesPage = {
  readonly nodes: readonly ResolverNode[]
  readonly totalCount: number
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

const RESOLVER_NODES_PAGE_SIZE = 100

const getResolverNodesPage = ResultFn(async function* ({
  address,
  after,
}: GetResolverNodesParameters & { readonly after: string | undefined }) {
  const { domainConnection } = yield* fromPromise(
    graphqlIndexerClient.request<{
      domainConnection: {
        totalCount: number
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        edges: { node: ResolverNode }[]
      }
    }>(
      gql`
        query getResolverNodes($resolver: String!, $first: Int!, $after: String) {
          domainConnection(
            first: $first
            after: $after
            where: { resolver: $resolver }
          ) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                owner {
                  id
                }
                resolver {
                  id
                  address
                }
              }
            }
          }
        }
      `,
      {
        resolver: address.toLowerCase(),
        first: RESOLVER_NODES_PAGE_SIZE,
        after,
      },
    ),
    (e) => new GetResolverNodesError({ cause: e as GraphqlRequestError }),
  )

  return ok<ResolverNodesPage>({
    nodes: domainConnection.edges.map(({ node }) => node),
    totalCount: domainConnection.totalCount,
    endCursor: domainConnection.pageInfo.endCursor,
    hasNextPage: domainConnection.pageInfo.hasNextPage,
  })
})

export const RESOLVER_NODES = 'get-resolver-nodes'

const getResolverNodesQueryKey = createQueryKey<
  typeof RESOLVER_NODES,
  GetResolverNodesParameters
>(RESOLVER_NODES)

/** The names set to resolve through a resolver, in pages. */
export const getResolverNodesQueryOptions = (
  params: GetResolverNodesParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getResolverNodesQueryKey(params),
    queryFn: ({ queryKey: [, { address }], pageParam }) =>
      getResolverNodesPage({ address, after: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ResolverNodesPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
  })
