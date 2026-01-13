import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import type { GetRecordsErrorType } from '@ensdomains/ensjs/public'
import type { GetSubgraphRecordsErrorType } from '@ensdomains/ensjs/subgraph'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { graphqlIndexerClient } from '@/lib/indexer'
import { getRecords } from './useRecords'
import { getSubgraphRecords } from './useSubgraphRecords'

class GetProfileError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType | GetSubgraphRecordsErrorType | ClientError
}> {}

const getProfile = ResultFn(async function* (name: string) {
  const subgraphV1Records = yield* getSubgraphRecords(name)

  const result = yield* fromPromise(
    graphqlIndexerClient.request<
      {
        domains: [
          {
            resolver: {
              texts: string[]
            } | null
          },
        ]
      },
      { name: string }
    >(
      gql`query getRecords($name: String!) {
    domains(where: {name: $name}) {
      resolver {
        texts
      }
    }
  }`,
      { name },
    ),
    (e) => new GetProfileError({ cause: e as ClientError }),
  )

  const subgraphV2Records = result.domains[0]?.resolver

  const coins = Array.from(
    new Set([
      ...(subgraphV1Records?.coins.map((coin) => Number(coin)) || []),

      // default requested coins

      // EVM
      coinNameToTypeMap.eth,
      coinNameToTypeMap.arb1,
      coinNameToTypeMap.op,
      coinNameToTypeMap.base,

      // Non-EVM
      coinNameToTypeMap.btc,
      coinNameToTypeMap.doge,
      coinNameToTypeMap.sol,
      coinNameToTypeMap.strk,
    ]),
  )

  // default requested texts
  const texts = Array.from(
    new Set([
      ...(subgraphV1Records?.texts || []),
      ...(subgraphV2Records?.texts || []),

      'name',
      'description',
      'com.twitter',
      'org.telegram',
      'header',
      'avatar',
    ]),
  )

  const records = yield* getRecords({
    name,
    ...subgraphV1Records,
    coins,
    texts,
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  })

  return ok({
    records,
    subgraphRecords: { ...subgraphV1Records },
  })
})

const profileQueryKey = createQueryKey<
  'profile',
  {
    name: string
  }
>('profile')

export const getProfileQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile(name),
  })
