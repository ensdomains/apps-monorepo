import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import type {
  V2Event,
  V2NameHistory,
} from '@/utils/history/transformAddressHistory'

class GetV2HistoryForAddressError extends TaggedError(
  'GetV2HistoryForAddressError',
)<{
  cause: GetV2HistoryForAddressErrorType
}> {}

type GetV2HistoryForAddressErrorType = GraphqlRequestError

type GetV2HistoryForAddressParameters = {
  address: Address
}

type V2DomainWithEvents = {
  name: string | null
  owner: { id: string }
  events: V2Event[]
}

const getV2HistoryForAddress = ResultFn(async function* ({
  address,
}: GetV2HistoryForAddressParameters) {
  const { domains } = yield* await fromPromise(
    graphqlIndexerClient.request<{
      domains: V2DomainWithEvents[]
    }>(
      gql`query getHistoryForAddress($addr: String!) {
      domains(where: {owner: $addr}) {
        name
        owner {
          id
        }
        events {
          name
          type
          transactionHash
          timestamp
          blockNumber
        }
      }
    }`,
      { addr: address.toLowerCase() },
    ),
    (e) =>
      new GetV2HistoryForAddressError({
        cause: e as GetV2HistoryForAddressErrorType,
      }),
  )

  // V2 has no separate registrar token: the registry owner *is* the holder. That
  // only counts for registrar-issued names, which is what `attributeName` checks —
  // the indexer's `registrant` field simply mirrors `owner` and proves nothing.
  const names: V2NameHistory[] = domains.map((domain) => ({
    name: domain.name,
    registrarHolder: domain.owner.id,
    events: domain.events,
  }))

  return ok(names)
})

const getV2HistoryForAddressQueryKey = createQueryKey<
  'get-v2-history-for-address',
  GetV2HistoryForAddressParameters
>('get-v2-history-for-address')

export const getV2HistoryForAddressQueryOptions = (
  params: GetV2HistoryForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getV2HistoryForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2HistoryForAddress(params),
  })
