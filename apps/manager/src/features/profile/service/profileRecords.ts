import {
  type BignameResponse,
  type NameRecords,
  parseRecordKey,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRecords } from '@ensdomains/ensjs/public'
import {
  type GetContentHashReturnType,
  getCoderFromCoin,
} from '@ensdomains/ensjs/utils'
import { fromPromise, fromThrowable, ok } from 'neverthrow'
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

/** Record keys the indexer has seen set on the name's resolver. */
type IndexedRecordKeys = {
  readonly texts: readonly string[]
  readonly coins: readonly number[]
}

/**
 * Key discovery only: the values are always read on chain below. bigname's
 * `known_keys` are the keys its inventory has seen; `unsupported_keys` are keys
 * set through a record family or resolver it cannot vouch for, which may still
 * hold values, so both are read. An omitted inventory (no current resolver
 * inventory) or a 404 (not indexed) adds no keys beyond the static lists.
 */
const toIndexedRecordKeys = (
  response: BignameResponse<NameRecords> | null,
): IndexedRecordKeys => {
  const inventory = response?.data.inventory
  const texts: string[] = []
  const coins: number[] = []
  for (const key of [
    ...(inventory?.known_keys ?? []),
    ...(inventory?.unsupported_keys ?? []),
  ]) {
    const parsed = parseRecordKey(key)
    if (parsed?.kind === 'text') texts.push(parsed.key)
    else if (parsed?.kind === 'avatar') texts.push('avatar')
    else if (parsed?.kind === 'addr') coins.push(parsed.coinType)
  }
  return { texts, coins }
}

const indexedRecordKeysInflight = new Map<string, Promise<IndexedRecordKeys>>()

function fetchIndexedRecordKeys(name: string): Promise<IndexedRecordKeys> {
  const existing = indexedRecordKeysInflight.get(name)
  if (existing) return existing

  const promise = bigname
    .getNameRecords(name, { include: ['inventory'] })
    .then(toIndexedRecordKeys)
    .finally(() => {
      indexedRecordKeysInflight.delete(name)
    })

  indexedRecordKeysInflight.set(name, promise)
  return promise
}

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
  const indexedKeys = yield* fromPromise(
    fetchIndexedRecordKeys(name),
    (error) => new GetProfileRecordsError({ cause: error }),
  )

  const texts = unique([
    ...staticTextRecords,
    ...textRecords.map((record) => record.key),
    ...forceFetchRecords.always,
    ...forceFetchRecords.whenNotIndexed,
    // Newly saved links must be readable before the indexer discovers the key.
    'links',
    ...indexedKeys.texts,
  ])
  const coins = unique([
    ...alwaysProbeAddressRecords.map(Number),
    ...addressRecords.map((record) => record.coinType),
    ...indexedKeys.coins,
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
