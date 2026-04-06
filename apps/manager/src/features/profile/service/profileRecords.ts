import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinTypeToNameMap } from '@ensdomains/address-encoder'
import { getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { forceFetchRecords } from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getIndexerRecords } from './getIndexerRecords'

class GetProfileRecordsError extends TaggedError('GetProfileRecordsError')<{
  cause: unknown
}> {}

const COIN_TYPE_NAME_MAP = coinTypeToNameMap as Record<
  string,
  readonly [string, string]
>

export const getProfileRecords = ResultFn(async function* (name: string) {
  if (name === 'debug') {
    return ok({
      ...DEBUG_PROFILE,
      _rawSubgraphRecords: {
        isMigrated: false,
        createdAt: new Date(),
      } as unknown as NonNullable<typeof indexerRecords>,
    })
  }

  const client = yield* safeGetClient()
  const indexerRecords = yield* getIndexerRecords(name)

  const resolverAddress = indexerRecords.resolverAddress as Address | undefined

  const result: ProfileRecordsResult = {
    texts: [],
    coins: [],
    resolverAddress,
    _rawSubgraphRecords: indexerRecords,
  }

  if (!resolverAddress) {
    return ok(result)
  }

  // Coins: use indexer data directly
  for (const coin of indexerRecords.coinAddresses) {
    if (!coin.address || coin.address === '0x') continue
    const symbolEntry = COIN_TYPE_NAME_MAP[String(coin.coinType)]
    result.coins.push({
      coinType: coin.coinType,
      value: coin.address,
      ...(symbolEntry ? { symbol: symbolEntry[0] } : {}),
    })
  }

  // Content hash: use indexer data
  if (indexerRecords.contentHash) {
    result.contentHash = indexerRecords.contentHash
  }

  // Text records + ABI: fetch on-chain via ensjs (indexer only has keys, not values)
  const texts = [
    ...forceFetchRecords.always,
    ...(indexerRecords
      ? indexerRecords.texts.filter(
          (t) => !forceFetchRecords.always.includes(t),
        )
      : forceFetchRecords.whenNotIndexed),
  ]

  const records = yield* fromPromise(
    getRecords(client, {
      name,
      texts,
      contentHash: false,
      abi: true,
      resolver: { address: resolverAddress },
    }),
    (error) => new GetProfileRecordsError({ cause: error }),
  )

  result.texts = records.texts

  if (records.abi) {
    result.abi =
      typeof records.abi.abi === 'string'
        ? records.abi.abi
        : JSON.stringify(records.abi.abi)
  }

  return ok(result)
})

export type ProfileRecordsResult = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string; symbol?: string }>
  contentHash?: string
  abi?: string
  resolverAddress?: Address
  _rawSubgraphRecords?: unknown
}

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
