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
import { err, fromPromise, fromThrowable, ok, okAsync } from 'neverthrow'
import type { Client, PublicClient, Transport } from 'viem'
import {
  type Address,
  decodeErrorResult,
  encodeFunctionData,
  type Hex,
  parseAbi,
  zeroAddress,
} from 'viem'
import { bigname } from '@/lib/bigname'
import { publicClient, type sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  offchainProfileRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'
import { getDebugProfileRecords } from '../MOCK'
import {
  hasV2NameEntry,
  NameRegistryNotFoundError,
  readNameResolver,
  resolveNameRegistry,
} from './changeResolver'
import { decodeCoinResult } from './decodeCoinRecord'
import { readResolverRecords } from './resolverImport'
import { isOffchainName } from './resolverRecordCalls'

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
const MAX_CONCURRENT_PROFILE_READS = 64

const GATEWAY_ERROR_ABI = parseAbi([
  'error HttpError(uint16 status, string message)',
])
// Statuses a gateway answers for a name it does not know (World answers 400).
const UNKNOWN_NAME_STATUSES: ReadonlySet<number> = new Set([400, 404])

// A resolver that reverts with no reason, or a gateway that answers 400 or 404,
// does not know the name. viem encodes every other gateway failure as an
// HttpError or Error(string).
const isNameRejection = (returnData: Hex): boolean =>
  returnData === '0x' ||
  fromThrowable(() =>
    decodeErrorResult({ abi: GATEWAY_ERROR_ABI, data: returnData }),
  )()
    .map(({ args: [status] }) => UNKNOWN_NAME_STATUSES.has(status))
    .unwrapOr(false)

const getRecordKeys = ResultFn(async function* (
  client: Client<Transport, typeof sepoliaWithEns>,
  name: string,
) {
  // A name bigname has not indexed has no indexed keys; the static ones still apply.
  const inventory = yield* bigname
    .nameRecords(name, { namespace: 'ens', include: ['inventory'] })
    .map(({ data }) => data.inventory)
    // Viewing/editing commonly used fields remains possible while the index
    // is unavailable. Resolver replacement performs a separate warned import.
    .orElse(() => okAsync(undefined))
  // The indexer never sees an offchain name's records. ensjs asks its gateway
  // for them in one request, which a URL-length limit caps well below every key.
  if (
    !inventory &&
    (yield* fromPromise(
      isOffchainName(client, name),
      (error) => new GetProfileRecordsError({ cause: error }),
    ))
  )
    return ok(offchainProfileRecords)

  const recordKeys = parseKnownKeys(inventory?.known_keys ?? [])
  return ok({
    texts: unique([
      ...staticTextRecords,
      ...textRecords.map((record) => record.key),
      ...forceFetchRecords.always,
      ...forceFetchRecords.whenNotIndexed,
      // Newly saved links must be readable before the indexer discovers the key.
      'links',
      ...recordKeys.texts,
    ]),
    coins: unique([
      ...alwaysProbeAddressRecords.map(Number),
      ...addressRecords.map((record) => record.coinType),
      ...recordKeys.coins,
    ]).filter(isSupportedCoinType),
  })
})

export const getProfileRecords = ResultFn(async function* (name: string) {
  const debugProfile = getDebugProfileRecords(name)
  if (debugProfile) return ok(debugProfile)

  const client = yield* safeGetClient()
  const { texts, coins } = yield* getRecordKeys(client, name)

  const v2Source = yield* fromPromise(
    (async () => {
      try {
        const location = await resolveNameRegistry(name)
        if (!(await hasV2NameEntry(location, publicClient as PublicClient)))
          return { resolver: undefined, hasV2Entry: false }
        const resolver = await readNameResolver(
          location,
          publicClient as PublicClient,
        )
        if (resolver.toLowerCase() !== zeroAddress)
          return { resolver, hasV2Entry: false }
        return {
          resolver: undefined,
          hasV2Entry: true,
        }
      } catch (error) {
        if (!(error instanceof NameRegistryNotFoundError)) throw error
      }
      return { resolver: undefined, hasV2Entry: false }
    })(),
    (error) => new GetProfileRecordsError({ cause: error }),
  )
  if (v2Source.hasV2Entry)
    return ok({ texts: [], coins: [] } satisfies ProfileRecordsResult)
  if (v2Source.resolver) {
    const { records, readErrors } = yield* fromPromise(
      readResolverRecords({
        name,
        resolver: v2Source.resolver,
        texts,
        coins,
        publicClient: publicClient as PublicClient,
        shouldDecodeStrictly: false,
        maxConcurrentReads: MAX_CONCURRENT_PROFILE_READS,
      }),
      (error) => new GetProfileRecordsError({ cause: error }),
    )
    // Unsupported probes are expected; failed reads must reach query retry/error handling.
    if (readErrors.length)
      return err(new GetProfileRecordsError({ cause: readErrors[0] }))
    return ok(records)
  }

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
  // A gateway that is down fails every read; that is not an empty profile. One
  // that rejects every read does not know the name, which is.
  const failedRead = resolution?.resolvedData.find(
    (item) => !(item.success || isNameRejection(item.returnData)),
  )
  if (failedRead && resolution?.resolvedData.every((item) => !item.success))
    return err(new GetProfileRecordsError({ cause: failedRead.returnData }))

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
