import { parseRecordKey, type RecordInventory } from '@ens-apps/bigname'
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
 * (`abi_content_types: null`), each of these is read on-chain instead, and
 * empty answers are dropped as for listed types.
 */
export const PROBED_ABI_CONTENT_TYPES: readonly bigint[] = [1n, 2n, 4n, 8n]

class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: unknown
}> {}

export type ProfileKeyTarget = { readonly id: string; readonly name: string }

/**
 * Keys from a bigname record inventory. `unsupported_keys` are keys the
 * resolver is known to hold whose values bigname cannot vouch for; they still
 * need copying, so they are read on-chain with `known_keys`. `unset_keys` are
 * known to be cleared and are skipped.
 */
export const profileKeysFromInventory = (
  id: string,
  inventory: RecordInventory,
): V1ProfileKeys => {
  const texts = new Set<string>()
  const coinTypes = new Set<number>()
  let hasContentHash = false
  for (const key of [...inventory.known_keys, ...inventory.unsupported_keys]) {
    const parsed = parseRecordKey(key)
    if (!parsed) continue
    switch (parsed.kind) {
      case 'text':
        texts.add(parsed.key)
        break
      case 'avatar':
        texts.add('avatar')
        break
      case 'addr':
        coinTypes.add(parsed.coinType)
        break
      case 'contenthash':
        hasContentHash = true
        break
    }
  }
  const abiContentTypes =
    inventory.abi_content_types === null
      ? PROBED_ABI_CONTENT_TYPES
      : [...new Set(inventory.abi_content_types.map((type) => BigInt(type)))]

  return {
    id: id.toLowerCase(),
    texts: [...texts],
    coinTypes: [...coinTypes],
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
      include: ['inventory'],
    },
    { signal },
  )
  // A name with no inventory container (unsupported, unregistered, or no
  // inventory row on its resolver) is left out, so callers see it as missing
  // rather than as a name with no records.
  return data.flatMap((result): V1ProfileKeys[] => {
    if (result.kind !== 'name' || result.status !== 'ok') return []
    const record = result.record
    if (!record || record.status === 'unsupported' || !record.inventory) {
      return []
    }
    return [profileKeysFromInventory(record.namehash, record.inventory)]
  })
}

/**
 * Record keys for many ENSv1 names through `POST /v1/lookup`
 * (`profile=detail`, `include=inventory`), up to 1,000 names per request.
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
