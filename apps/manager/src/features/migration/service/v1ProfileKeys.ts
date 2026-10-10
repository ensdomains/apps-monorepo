import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import type { BignameLookupError } from './bignameLookup'
import { lookupNames } from './bignameLookup'

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
}

export class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: BignameLookupError
}> {}

export const hasV1ProfileRecords = (keys: V1ProfileKeys): boolean =>
  keys.texts.length > 0 ||
  keys.coinTypes.length > 0 ||
  keys.hasContentHash ||
  keys.abiContentTypes.length > 0

/**
 * Seen keys include ones whose indexed value is null: the chain read decides
 * what is copied. A record without a complete inventory is left out, so callers
 * fail closed. Missing seen_abis is unknown, while [] is known empty: probing
 * only the four conventional encodings can silently lose other uint256 types.
 */
export const toV1ProfileKeys = (record: LookupRecord): V1ProfileKeys[] => {
  const { records } = record
  if (!records?.seen_abis) return []
  return [
    {
      id: record.namehash.toLowerCase(),
      texts: records.seen_texts,
      coinTypes: records.seen_addresses
        .map(Number)
        .filter((coinType) => Number.isSafeInteger(coinType)),
      hasContentHash: records.seen_singletons.includes('contenthash'),
      abiContentTypes: records.seen_abis
        .filter((contentType) => /^\d+$/.test(contentType))
        .map((contentType) => BigInt(contentType)),
    },
  ]
}

export const getV1ProfileKeys = ResultFn(async function* (
  names: readonly string[],
  options: { readonly signal?: AbortSignal } = {},
) {
  const records = yield* lookupNames(bigname.lookup, names, options).mapErr(
    (error) => new GetV1ProfilesError({ cause: error }),
  )
  return ok(records.flatMap(toV1ProfileKeys))
})
