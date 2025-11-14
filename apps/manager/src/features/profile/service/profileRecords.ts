import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { type GetRecordsReturnType, getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { addressRecords, staticTextRecords, textRecords } from '../data/records'

class RecordsError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

export const getProfileRecords = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  // const subgraphRecords = yield* getSubgraphRecords(name)

  const coins = Array.from(
    new Set([
      // ...(subgraphRecords?.coins.map((coin) => Number(coin)) || []),
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

  console.log(
    'coins',
    addressRecords.map((r) => r.coinType),
  )

  const texts = Array.from(
    new Set([
      // ...(subgraphRecords?.texts || []),
      ...staticTextRecords,
      ...textRecords.map((r) => r.key),
    ]),
  )

  const records = yield* await fromPromise(
    getRecords(client, {
      // ...subgraphRecords,
      name,
      resolver: { address: '0x55265fad0129f9d57d4e1b0a4d083bd192ab0716' },
      coins,
      texts,
      contentHash: true,
      ignoreInvalidCoinTypes: true,
      abi: true,
    }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok(records)
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
