import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRecords } from '@ensdomains/ensjs/public'
import {
  type GetContentHashReturnType,
  getCoderFromCoin,
} from '@ensdomains/ensjs/utils'
import { errAsync, fromPromise, fromThrowable, ok, okAsync } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isDebugProfileName } from '@/utils/debug-features'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getProfileCoinRecords } from './profileCoinRecords'

class GetProfileRecordsError extends TaggedError('GetProfileRecordsError')<{
  cause: unknown
}> {}

const parseKnownKeys = (keys: readonly string[]) => ({
  texts: keys.flatMap((key) =>
    key.startsWith('text:') ? [key.slice('text:'.length)] : [],
  ),
  coins: keys.flatMap((key) => {
    const coinType = key.startsWith('addr:')
      ? Number(key.slice('addr:'.length))
      : Number.NaN
    return Number.isSafeInteger(coinType) ? [coinType] : []
  }),
})

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values))

const normalizeResolverAddress = (address: Address): Address | undefined =>
  address.toLowerCase() === zeroAddress ? undefined : address

const normalizeContentHash = (
  contentHash: GetContentHashReturnType,
): string | undefined => {
  if (!contentHash) return undefined
  if (!contentHash.protocolType) return contentHash.decoded
  return `${contentHash.protocolType}://${contentHash.decoded}`
}

const safeGetCoderFromCoin = fromThrowable(getCoderFromCoin, () => undefined)

const isSupportedCoinType = (coinType: number): boolean =>
  safeGetCoderFromCoin(coinType).isOk()

export const getProfileRecords = ResultFn(async function* (name: string) {
  if (isDebugProfileName(name)) {
    return ok(DEBUG_PROFILE)
  }

  const client = yield* safeGetClient()
  // A name bigname has not indexed has no indexed keys; the static ones still apply.
  const recordKeys = yield* bigname
    .nameRecords(name, { namespace: 'ens', include: ['inventory'] })
    .map(({ data }) => parseKnownKeys(data.inventory?.known_keys ?? []))
    .orElse((error) =>
      error.code === 'not_found'
        ? okAsync(parseKnownKeys([]))
        : errAsync(new GetProfileRecordsError({ cause: error })),
    )

  const texts = unique([
    ...staticTextRecords,
    ...textRecords.map((record) => record.key),
    ...forceFetchRecords.always,
    ...forceFetchRecords.whenNotIndexed,
    // Newly saved links must be readable before the indexer discovers the key.
    'links',
    ...recordKeys.texts,
  ])
  const coins = unique([
    ...alwaysProbeAddressRecords.map(Number),
    ...addressRecords.map((record) => record.coinType),
    ...recordKeys.coins,
  ]).filter(isSupportedCoinType)

  const [records, coinRecords] = yield* fromPromise(
    Promise.all([
      getRecords(client, {
        name,
        texts,
        contentHash: true,
        abi: true,
      }),
      getProfileCoinRecords(client, name, coins),
    ]),
    (error) => new GetProfileRecordsError({ cause: error }),
  )

  const result: ProfileRecordsResult = {
    texts: records.texts,
    coins: coinRecords,
    resolverAddress: normalizeResolverAddress(records.resolverAddress),
  }

  const contentHash = normalizeContentHash(records.contentHash)
  if (contentHash) {
    result.contentHash = contentHash
  }

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
}

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
