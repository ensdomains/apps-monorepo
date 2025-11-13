import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { type GetRecordsReturnType, getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getSubgraphRecords } from './getSubgraphRecords'

class RecordsError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

export const getProfileRecords = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  const subgraphRecords = yield* getSubgraphRecords(name)

  const coins = Array.from(
    new Set([
      ...(subgraphRecords?.coins.map((coin) => Number(coin)) || []),
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

  const texts = Array.from(
    new Set([
      ...(subgraphRecords?.texts || []),
      'name',
      'description',
      'com.twitter',
      'org.telegram',
    ]),
  )

  const records = yield* await fromPromise(
    getRecords(client, {
      ...subgraphRecords,
      name,
      coins,
      texts,
      contentHash: true,
      abi: true,
    }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok({
    ...records,
    subgraphRecords,
  })
})

export type ProfileRecordsResult = GetRecordsReturnType<
  readonly string[],
  readonly (string | number)[],
  false,
  false
>

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
