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
}

export type V2NameHistoryEvent = {
  name: string
  type: string
  transactionHash: Hex
  timestamp: number
  blockNumber: number
  // Resolver event fields (available when indexer supports them)
  key?: string | null // For TextChanged events
  value?: string | null // For TextChanged events
  coinType?: string | null // For MulticoinAddrChanged events
  addr?: string | null // For AddrChanged/MulticoinAddrChanged events
  contentHash?: string | null // For ContenthashChanged events
}

type V2DomainWithEvents = {
  events: V2NameHistoryEvent[]
}

const getV2NameHistory = ResultFn(async function* ({
  name,
}: GetV2NameHistoryParameters) {
  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<{
      domains: V2DomainWithEvents[]
    }>(
      gql`
        query getV2NameHistory($name: String!) {
          domains(where: { name: $name }) {
            events {
              name
              type
              transactionHash
              timestamp
              blockNumber
              # TODO: Uncomment when indexer supports resolver event fields
              # key
              # value
              # coinType
              # addr
              # contentHash
            }
          }
        }
      `,
      { name: name.toLowerCase() },
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
