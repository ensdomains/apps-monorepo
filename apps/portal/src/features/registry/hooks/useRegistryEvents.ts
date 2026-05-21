import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryEventsError extends TaggedError('GetRegistryEventsError')<{
  cause: ClientError
}> {}

type GetRegistryEventsParameters = {
  address: Address
  first?: number
  after?: string
  orderDirection?: 'asc' | 'desc'
}

export type RegistryEvent = {
  id: string
  type: string
  name: string | null
  namehash: string | null
  protocol: string
  contractAddress: string
  transactionHash: Hash
  blockNumber: number
  timestamp: number
  data: string | null
}

export type RegistryEventsPage = {
  events: RegistryEvent[]
  totalCount: number | null
  pageInfo: {
    endCursor: string | null
    hasNextPage: boolean
  }
}

const getRegistryEvents = ResultFn(async function* ({
  address,
  first = 20,
  after,
  orderDirection = 'desc',
}: GetRegistryEventsParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        eventConnection: {
          totalCount: number | null
          pageInfo: { endCursor: string | null; hasNextPage: boolean }
          edges: { node: RegistryEvent }[]
        }
      } | null
    }>(
      gql`
        query getRegistryEvents(
          $address: String!
          $first: Int
          $after: String
          $orderDirection: OrderDirection
        ) {
          registry(address: $address) {
            eventConnection(
              first: $first
              after: $after
              orderBy: timestamp
              orderDirection: $orderDirection
            ) {
              totalCount
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  id
                  type
                  name
                  namehash
                  protocol
                  contractAddress
                  transactionHash
                  blockNumber
                  timestamp
                  data
                }
              }
            }
          }
        }
      `,
      { address: address.toLowerCase(), first, after, orderDirection },
    ),
    (e) => new GetRegistryEventsError({ cause: e as ClientError }),
  )

  const page: RegistryEventsPage = registry
    ? {
        events: registry.eventConnection.edges.map((e) => e.node),
        totalCount: registry.eventConnection.totalCount,
        pageInfo: registry.eventConnection.pageInfo,
      }
    : {
        events: [],
        totalCount: 0,
        pageInfo: { endCursor: null, hasNextPage: false },
      }

  return ok(page)
})

const getRegistryEventsQueryKey = createQueryKey<
  'get-registry-events',
  GetRegistryEventsParameters
>('get-registry-events')

export const getRegistryEventsQueryOptions = (
  params: GetRegistryEventsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryEventsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryEvents(params),
  })
