import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryReferencedByError extends TaggedError(
  'GetRegistryReferencedByError',
)<{
  cause: GraphqlRequestError
}> {}

type GetRegistryReferencedByParameters = {
  readonly address: Address
}

type RegistryReferencedByPage = {
  /** Null where the indexer cannot name the referencing domain. */
  readonly names: readonly (string | null)[]
  readonly totalCount: number
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

const REFERENCED_BY_PAGE_SIZE = 100

const EMPTY_PAGE: RegistryReferencedByPage = {
  names: [],
  totalCount: 0,
  endCursor: null,
  hasNextPage: false,
}

const getRegistryReferencedByPage = ResultFn(async function* ({
  address,
  after,
}: GetRegistryReferencedByParameters & { readonly after: string | undefined }) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      readonly registry: {
        readonly referencedByConnection: {
          readonly totalCount: number
          readonly pageInfo: {
            readonly hasNextPage: boolean
            readonly endCursor: string | null
          }
          readonly edges: readonly {
            readonly node: { readonly name: string | null }
          }[]
        }
      } | null
    }>(
      gql`
        query getRegistryReferencedBy(
          $address: String!
          $first: Int!
          $after: String
        ) {
          registry(address: $address) {
            referencedByConnection(first: $first, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  name
                }
              }
            }
          }
        }
      `,
      {
        address: address.toLowerCase(),
        first: REFERENCED_BY_PAGE_SIZE,
        after,
      },
    ),
    (e) =>
      new GetRegistryReferencedByError({ cause: e as GraphqlRequestError }),
  )

  if (!registry) return ok(EMPTY_PAGE)

  const { totalCount, pageInfo, edges } = registry.referencedByConnection
  return ok<RegistryReferencedByPage>({
    names: edges.map(({ node }) => node.name),
    totalCount,
    endCursor: pageInfo.endCursor,
    hasNextPage: pageInfo.hasNextPage,
  })
})

const getRegistryReferencedByQueryKey = createQueryKey<
  'get-registry-referenced-by',
  GetRegistryReferencedByParameters
>('get-registry-referenced-by')

/** The names whose subregistry is this registry, in pages. */
export const getRegistryReferencedByQueryOptions = (
  params: GetRegistryReferencedByParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getRegistryReferencedByQueryKey(params),
    queryFn: ({ queryKey: [, { address }], pageParam }) =>
      getRegistryReferencedByPage({ address, after: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RegistryReferencedByPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
  })
