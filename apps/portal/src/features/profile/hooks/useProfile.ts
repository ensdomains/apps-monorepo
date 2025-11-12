import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import type { GetRecordsErrorType } from '@ensdomains/ensjs/public'
import type { GetSubgraphRecordsErrorType } from '@ensdomains/ensjs/subgraph'
import { ok } from 'neverthrow'
import { getRecords } from './useRecords'
import { getSubgraphRecords } from './useSubgraphRecords'

export class GetProfileError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType | GetSubgraphRecordsErrorType
}> {}

export const getProfile = ResultFn(async function* (name: string) {
  const subgraphRecords = yield* getSubgraphRecords(name)

  const coins = Array.from(
    new Set([
      ...(subgraphRecords?.coins.map((coin) => Number(coin)) || []),

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
      ...(subgraphRecords?.texts || []),

      'name',
      'description',
      'com.twitter',
      'org.telegram',
    ]),
  )

  const records = yield* getRecords({
    name,
    ...subgraphRecords,
    coins,
    texts,
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  })

  return ok({
    records,
    subgraphRecords,
  })
})

export const profileQueryKey = createQueryKey<
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
