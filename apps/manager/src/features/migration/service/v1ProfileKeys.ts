import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { lookupNames } from './bignameLookup'

/** Every ABI content type a resolver can store, probed when bigname cannot list them. */
const ALL_ABI_CONTENT_TYPES: readonly bigint[] = [1n, 2n, 4n, 8n]

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
}

export class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: unknown
}> {}

export const hasV1ProfileRecords = (keys: V1ProfileKeys): boolean =>
  keys.texts.length > 0 ||
  keys.coinTypes.length > 0 ||
  keys.hasContentHash ||
  keys.abiContentTypes.length > 0

/**
 * Seen keys include ones whose indexed value is null: the chain read decides
 * what is copied. A record without an inventory is left out, so callers treat
 * the name as missing.
 */
export const toV1ProfileKeys = (record: LookupRecord): V1ProfileKeys[] => {
  const { records } = record
  if (!records) return []
  return [
    {
      id: record.namehash.toLowerCase(),
      texts: records.seen_texts,
      coinTypes: records.seen_addresses
        .map(Number)
        .filter((coinType) => Number.isSafeInteger(coinType)),
      hasContentHash: records.seen_singletons.includes('contenthash'),
      abiContentTypes: records.seen_abis
        ? records.seen_abis
            .filter((contentType) => /^\d+$/.test(contentType))
            .map((contentType) => BigInt(contentType))
        : ALL_ABI_CONTENT_TYPES,
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
