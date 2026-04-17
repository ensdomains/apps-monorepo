import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Hex } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetV2NameHistoryError extends TaggedError('GetV2NameHistoryError')<{
  cause: GetV2NameHistoryErrorType
}> {}

type GetV2NameHistoryErrorType = ClientError

type GetV2NameHistoryParameters = {
  name: string
  first?: number
  orderDirection?: 'asc' | 'desc'
}

export type V2NameHistoryEvent = {
  name: string
  type: string
  transactionHash: Hex
  timestamp: number
  blockNumber: number
}

type V2DomainWithEvents = {
  events: V2NameHistoryEvent[]
}

const getV2NameHistory = ResultFn(async function* ({
  name,
  first,
  orderDirection,
}: GetV2NameHistoryParameters) {
  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<{
      domains: V2DomainWithEvents[]
    }>(
      gql`
        query getV2NameHistory($name: String!, $first: Int, $orderDirection: OrderDirection) {
          domains(where: { name: $name }) {
            events(first: $first, orderBy: timestamp, orderDirection: $orderDirection) {
              name
              type
              transactionHash
              timestamp
              blockNumber
            }
          }
        }
      `,
      { name: name.toLowerCase(), first, orderDirection },
    ),
    (e) =>
      new GetV2NameHistoryError({
        cause: e as GetV2NameHistoryErrorType,
      }),
  )

  // Query returns at most one domain (filtered by name)
  const events = domains[0]?.events ?? []

  return ok(events)
})

const getV2NameHistoryQueryKey = createQueryKey<
  'get-v2-name-history',
  GetV2NameHistoryParameters
>('get-v2-name-history')

export const getV2NameHistoryQueryOptions = (
  params: GetV2NameHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getV2NameHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2NameHistory(params),
  })
