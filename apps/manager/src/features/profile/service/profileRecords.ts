import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type ResolveNameDataReturnType,
  resolveNameData,
} from '@ensdomains/ensjs/public'
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
import { type Address, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'
import { getDebugProfileRecords } from '../MOCK'
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

const MAX_RESOLVER_SPLIT_DEPTH = 1

export const getProfileRecords = ResultFn(async function* (name: string) {
  const debugProfile = getDebugProfileRecords(name)
  if (debugProfile) return ok(debugProfile)

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

  const data = [
    ...texts.map((key) => encodeFunctionData(getTextParameters({ name, key }))),
    ...coins.map((coin) =>
      encodeFunctionData(getAddressParameters({ name, coin })),
    ),
    encodeFunctionData(getContentHashParameters({ name })),
    encodeFunctionData(getAbiParameters({ name })),
  ]

  const resolveData = async (
    calls: Hex[],
    splitDepth = 0,
  ): Promise<ResolveNameDataReturnType<Hex[]>> => {
    try {
      return await resolveNameData(client, { name, data: calls })
    } catch (error) {
      if (calls.length === 1 || splitDepth >= MAX_RESOLVER_SPLIT_DEPTH) {
        throw error
      }

      // A large inner multicall can exceed resolver gas or provider body limits.
      // Try one split, but bound retries when a transport or gateway is down.
      const midpoint = Math.floor(calls.length / 2)
      const left = await resolveData(calls.slice(0, midpoint), splitDepth + 1)
      const right = await resolveData(calls.slice(midpoint), splitDepth + 1)
      const resolverAddress = left?.resolverAddress ?? right?.resolverAddress
      if (!resolverAddress) return null

      const failedResults = (length: number) =>
        Array.from({ length }, () => ({
          success: false,
          returnData: '0x' as Hex,
        }))

      return {
        resolverAddress,
        resolvedData: [
          ...(left?.resolvedData ?? failedResults(midpoint)),
          ...(right?.resolvedData ?? failedResults(calls.length - midpoint)),
        ],
      }
    }
  }

  const resolution = yield* fromPromise(
    resolveData(data),
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
  const abi = abiData
    ? yield* fromPromise(
        decodeAbiResult(abiData, { strict: false }),
        (error) => new GetProfileRecordsError({ cause: error }),
      )
    : null
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
