import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { resolveNameData } from '@ensdomains/ensjs/public'
import {
  decodeAbiResult,
  decodeContentHashResult,
  decodeTextResult,
  type GetContentHashReturnType,
  getAbiParameters,
  getAddressParameters,
  getCoderFromCoin,
  getContentHashParameters,
  getTextParameters,
} from '@ensdomains/ensjs/utils'
import { errAsync, fromPromise, fromThrowable, ok, okAsync } from 'neverthrow'
import { type Address, encodeFunctionData, zeroAddress } from 'viem'
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
import { decodeCoinResult } from './decodeCoinRecord'

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

  const resolution = yield* fromPromise(
    resolveNameData(client, {
      name,
      data: [
        ...texts.map((key) =>
          encodeFunctionData(getTextParameters({ name, key })),
        ),
        ...coins.map((coin) =>
          encodeFunctionData(getAddressParameters({ name, coin })),
        ),
        encodeFunctionData(getContentHashParameters({ name })),
        encodeFunctionData(getAbiParameters({ name })),
      ],
    }),
    (error) => new GetProfileRecordsError({ cause: error }),
  )

  const rawResult = (index: number) => {
    const item = resolution?.resolvedData[index]
    return item?.success ? item.returnData : undefined
  }
  const result: ProfileRecordsResult = {
    texts: texts.flatMap((key, index) => {
      const data = rawResult(index)
      const value = data ? decodeTextResult(data, { strict: false }) : null
      return value ? [{ key, value }] : []
    }),
    coins: coins.flatMap((coin, index) => {
      const data = rawResult(texts.length + index)
      const record = data ? decodeCoinResult(coin, data) : null
      return record ? [record] : []
    }),
    resolverAddress: normalizeResolverAddress(
      resolution?.resolverAddress ?? zeroAddress,
    ),
  }

  const contentHashData = rawResult(texts.length + coins.length)
  const contentHash = normalizeContentHash(
    contentHashData
      ? decodeContentHashResult(contentHashData, { strict: false })
      : null,
  )
  if (contentHash) {
    result.contentHash = contentHash
  }

  const abiData = rawResult(texts.length + coins.length + 1)
  const abi = abiData ? await decodeAbiResult(abiData, { strict: false }) : null
  if (abi) {
    result.abi = typeof abi.abi === 'string' ? abi.abi : JSON.stringify(abi.abi)
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
