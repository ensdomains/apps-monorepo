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
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getIndexerRecords } from './getIndexerRecords'

class GetProfileRecordsError extends TaggedError('GetProfileRecordsError')<{
  cause: unknown
}> {}

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

  const texts = unique([
    ...staticTextRecords,
    ...textRecords.map((record) => record.key),
    ...forceFetchRecords.always,
    ...forceFetchRecords.whenNotIndexed,
    ...indexerRecords.texts,
  ])
  const coins = unique([
    ...alwaysProbeAddressRecords.map(Number),
    ...addressRecords.map((record) => record.coinType),
    ...indexerRecords.coins,
  ]).filter(isSupportedCoinType)

  const records = yield* fromPromise(
    getRecords(client, {
      name,
      texts,
      coins,
      contentHash: true,
      abi: true,
      ignoreInvalidCoinTypes: true,
    }),
    (error) => new GetProfileRecordsError({ cause: error }),
  )

  const result: ProfileRecordsResult = {
    texts: records.texts,
    coins: records.coins,
    resolverAddress: normalizeResolverAddress(records.resolverAddress),
    _rawSubgraphRecords: indexerRecords,
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
  _rawSubgraphRecords?: unknown
}

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
