import {
  type BignameError,
  isStale,
  type NameRecords,
  readAllCollectionPages,
  retryStale,
} from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { checkNotAborted } from './bignameLookup'

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
  readonly interfaceIds: readonly Hex[]
}

/** A name whose records are read from the ENSv1 resolver it points at. */
export type V1ProfileSource = {
  /** The name's namehash. */
  readonly id: string
  readonly name: string
  readonly resolver: Address
}

export class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: BignameError | Error
}> {}

// One request per name; a few at a time keeps a large wallet from flooding bigname.
const CONCURRENT_READS = 8
const EVENTS_PAGE_SIZE = 200
const INTERFACE_KEY_PREFIX = 'interface:'

/**
 * Known and unset keys both count: the chain read decides what is copied. A
 * name without an inventory, or whose ABI types cannot be listed, is left out
 * so callers fail closed.
 */
export const toV1ProfileKeys = (
  id: string,
  { inventory, records }: NameRecords,
  interfaceIds: readonly Hex[] = [],
): V1ProfileKeys[] => {
  if (!inventory?.abi_content_types) return []
  const keys = [...inventory.known_keys, ...inventory.unset_keys]
  const texts = keys.flatMap((key) =>
    key.startsWith('text:') ? [key.slice('text:'.length)] : [],
  )
  const coinTypes = keys
    .flatMap((key) =>
      key.startsWith('addr:') ? [key.slice('addr:'.length)] : [],
    )
    .map(Number)
    .filter((coinType) => Number.isSafeInteger(coinType))
  return [
    {
      id: id.toLowerCase(),
      texts: [...new Set(texts)],
      coinTypes: [...new Set(coinTypes)],
      hasContentHash:
        keys.includes('contenthash') || records.contenthash?.status === 'ok',
      abiContentTypes: inventory.abi_content_types
        .filter((contentType) => /^\d+$/.test(contentType))
        .map((contentType) => BigInt(contentType)),
      interfaceIds,
    },
  ]
}

// The inventory has no interface keys, so they come from the resolver's
// `interface:<id>` record events; the chain read drops cleared ones.
const readInterfaceIds = (
  { name, resolver }: V1ProfileSource,
  signal?: AbortSignal,
) =>
  readAllCollectionPages(
    (cursor, pageSignal) =>
      bigname.events(
        {
          name,
          resolver: `${envConfig.chain.id}:${resolver.toLowerCase()}`,
          type: ['record'],
          include: ['data'],
          page_size: EVENTS_PAGE_SIZE,
          ...(cursor !== undefined && { cursor }),
        },
        { signal: pageSignal },
      ),
    { signal },
  ).map((rows) => [
    ...new Set(
      rows.flatMap((row) =>
        row.type === 'record' && row.data?.key?.startsWith(INTERFACE_KEY_PREFIX)
          ? [
              row.data.key
                .slice(INTERFACE_KEY_PREFIX.length)
                .toLowerCase() as Hex,
            ]
          : [],
      ),
    ),
  ])

// The resolver route serves the source resolver's inventory even when a name
// read withholds records; naming the one key keeps it under the 200-key limit.
const readProfileKeys = (source: V1ProfileSource, signal?: AbortSignal) =>
  ResultAsync.combine([
    retryStale(
      () =>
        bigname.resolverRecords(
          envConfig.chain.id,
          source.resolver.toLowerCase(),
          { name: source.name, include: ['inventory'], keys: ['contenthash'] },
        ),
      isStale,
    )
      .map(({ data }): NameRecords | null => data)
      .orElse((error) =>
        // Not indexed at this resolver: left out, so the caller fails closed.
        error.code === 'not_found'
          ? okAsync<NameRecords | null, BignameError>(null)
          : errAsync(error),
      ),
    readInterfaceIds(source, signal),
  ] as const).map(([data, interfaceIds]) =>
    data ? toV1ProfileKeys(source.id, data, interfaceIds) : [],
  )

export const getV1ProfileKeys = ResultFn(async function* (
  sources: readonly V1ProfileSource[],
  options: { readonly signal?: AbortSignal } = {},
) {
  const toError = (cause: BignameError | Error) =>
    new GetV1ProfilesError({ cause })
  let keys: readonly V1ProfileKeys[] = []
  for (let start = 0; start < sources.length; start += CONCURRENT_READS) {
    yield* checkNotAborted(options.signal, toError)
    const batch = sources.slice(start, start + CONCURRENT_READS)
    const results = await Promise.all(
      batch.map((source) => readProfileKeys(source, options.signal)),
    )
    for (const result of results)
      keys = [...keys, ...(yield* result.mapErr(toError))]
  }
  return ok(keys)
})
