import type { RecordGroups } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { withRequestDeadline } from './requestDeadline'
import { LOOKUP_BATCH_SIZE } from './v1Names'

/**
 * Which resolver records a name may have set, so the migration reads and
 * replays exactly those on-chain. `id` is the name's namehash.
 */
export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
}

export const hasV1ProfileRecords = (keys: V1ProfileKeys): boolean =>
  keys.texts.length > 0 ||
  keys.coinTypes.length > 0 ||
  keys.hasContentHash ||
  keys.abiContentTypes.length > 0

/**
 * The ABI content types the ENS resolver profiles define (JSON, zlib JSON,
 * CBOR, URI). When bigname cannot list a name's ABI content types
 * (`seen_abis` omitted, with `abi_unsupported_reason`), each of these is read
 * on-chain instead, and empty answers are dropped as for listed types.
 */
export const PROBED_ABI_CONTENT_TYPES: readonly bigint[] = [1n, 2n, 4n, 8n]

class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: unknown
}> {}

export type ProfileKeyTarget = { readonly id: string; readonly name: string }

/** A `seen_*` key is worth reading unless bigname knows it was cleared (`null`). */
const isNotCleared =
  (values: Readonly<Record<string, unknown>>) =>
  (key: string): boolean =>
    values[key] !== null

/**
 * Keys from a name's grouped `records` (lookup `profile=detail`). Each
 * `seen_*` list names the keys the resolver has written. A key mapped to
 * `null` was cleared and is skipped; a key missing from its value map has a
 * value bigname cannot vouch for, so it is still read on-chain. `avatar` is a
 * text key; coin types are canonical decimal strings.
 */
export const profileKeysFromRecords = (
  id: string,
  records: RecordGroups,
): V1ProfileKeys => {
  const texts = records.seen_texts.filter(isNotCleared(records.texts))
  const coinTypes = records.seen_addresses
    .filter(isNotCleared(records.addresses))
    .flatMap((coinType) => {
      const value = Number(coinType)
      return Number.isSafeInteger(value) ? [value] : []
    })
  const hasContentHash =
    records.seen_singletons.includes('contenthash') &&
    records.contenthash !== null
  const abiContentTypes =
    records.seen_abis === undefined
      ? PROBED_ABI_CONTENT_TYPES
      : [...new Set(records.seen_abis.map((type) => BigInt(type)))]

  return {
    id: id.toLowerCase(),
    texts: [...new Set(texts)],
    coinTypes: [...new Set(coinTypes)],
    hasContentHash,
    abiContentTypes,
  }
}

const fetchProfileKeysBatch = async (
  targets: readonly ProfileKeyTarget[],
  signal: AbortSignal,
): Promise<V1ProfileKeys[]> => {
  const { data } = await bigname.lookup(
    {
      inputs: targets.map(({ id, name }) => ({ id, name })),
      profile: 'detail',
    },
    { signal },
  )
  // A name without `records` (unsupported, unregistered, or one whose records
  // bigname withholds, e.g. `unresolvable_reason: no_live_ens_v2_entry`) is
  // left out, so callers see it as missing rather than as a name with no
  // records.
  return data.flatMap((result): V1ProfileKeys[] => {
    if (result.kind !== 'name' || result.status !== 'ok') return []
    const record = result.record
    if (!record || record.status === 'unsupported' || !record.records) {
      return []
    }
    return [profileKeysFromRecords(record.namehash, record.records)]
  })
}

/**
 * Record keys for many ENSv1 names through `POST /v1/lookup`
 * (`profile=detail`), up to 1,000 names per request.
 */
export const getV1ProfileKeys = ResultFn(async function* (
  targets: readonly ProfileKeyTarget[],
  options: { readonly signal?: AbortSignal } = {},
) {
  if (targets.length === 0) return ok([] as V1ProfileKeys[])

  const result = yield* fromPromise(
    (async () => {
      const unique = [
        ...new Map(
          targets.map((target) => [target.id.toLowerCase(), target]),
        ).values(),
      ]
      const batches: ProfileKeyTarget[][] = []
      for (let i = 0; i < unique.length; i += LOOKUP_BATCH_SIZE) {
        batches.push(unique.slice(i, i + LOOKUP_BATCH_SIZE))
      }
      const batchResults = await Promise.all(
        batches.map((batch) =>
          withRequestDeadline(
            (signal) => fetchProfileKeysBatch(batch, signal),
            options,
          ),
        ),
      )
      return batchResults.flat()
    })(),
    (error) => new GetV1ProfilesError({ cause: error }),
  )

  return ok(result)
})
