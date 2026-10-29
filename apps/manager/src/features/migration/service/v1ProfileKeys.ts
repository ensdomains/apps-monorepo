import {
  BignameError,
  isStale,
  type NameRecords,
  readAllCollectionPages,
  retryStale,
} from '@ens-apps/indexer/bigname'
import { isAddressOnlyResolver } from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, errAsync, ok, okAsync, ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import {
  checkNotAborted,
  type LookupNameRecord,
  lookupNameRecords,
} from './bignameLookup'
import {
  hasKnownContentHashGetter,
  UnsupportedResolverRecordsError,
} from './fetchV1Profiles.helpers'
import { getV1ProfileKeysFromLookup } from './v1ProfileKeysFromLookup'

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
  readonly interfaceIds: readonly Hex[]
  readonly hasName?: boolean
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
  hasName = false,
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
      ...((hasName || keys.includes('name')) && { hasName: true }),
    },
  ]
}

// The inventory has no interface keys, so they come from the resolver's
// `interface:<id>` record events; the chain read drops cleared ones.
const readSupplementalKeys = (
  { name, resolver }: V1ProfileSource,
  signal?: AbortSignal,
) =>
  readAllCollectionPages(
    (cursor, pageSignal) =>
      bigname
        .events(
          {
            name,
            resolver: `${envConfig.chain.id}:${resolver.toLowerCase()}`,
            type: ['record'],
            include: ['data'],
            page_size: EVENTS_PAGE_SIZE,
            ...(cursor !== undefined && { cursor }),
          },
          { signal: pageSignal },
        )
        .andThen((envelope) => {
          const chainCompleteness =
            envelope.meta.as_of_completeness?.[String(envConfig.chain.id)]
              ?.completeness
          if (
            (envelope.meta.completeness !== undefined &&
              envelope.meta.completeness !== 'full') ||
            (chainCompleteness !== undefined && chainCompleteness !== 'full')
          ) {
            return err(
              new BignameError({
                code: 'unsupported',
                message:
                  'Incomplete resolver record history cannot establish safe migration',
                details: { ensName: name },
              }),
            )
          }
          return ok(envelope)
        }),
    { signal },
  ).andThen((rows) => {
    const keys = rows.flatMap((row) =>
      row.type === 'record' && row.data?.key ? [row.data.key] : [],
    )
    // The inventory API excludes DNS. Even a past deletion cannot establish
    // that the whole zone is empty, so refuse DNS history rather than drop it.
    if (keys.some((key) => key.startsWith('dns:'))) {
      return err(
        new UnsupportedResolverRecordsError({
          ensName: name,
          recordType: 'dns',
        }),
      )
    }
    return ok({
      hasName: keys.includes('name'),
      interfaceIds: [
        ...new Set(
          keys.flatMap((key) =>
            key.startsWith(INTERFACE_KEY_PREFIX)
              ? [key.slice(INTERFACE_KEY_PREFIX.length).toLowerCase() as Hex]
              : [],
          ),
        ),
      ],
    })
  })

// The resolver route serves the source resolver's inventory even when a name
// read withholds records. Inventory-only reads do not fetch record values.
const readProfileKeys = (
  source: V1ProfileSource,
  bulkRecords: ResultAsync<ReadonlyMap<string, LookupNameRecord>, never>,
  onFailure: () => void,
  signal?: AbortSignal,
  chainId?: number,
) => {
  if (isAddressOnlyResolver(source.resolver, envConfig.chain.id)) {
    return okAsync<V1ProfileKeys[], BignameError>([
      {
        id: source.id.toLowerCase(),
        texts: [],
        coinTypes: [60],
        hasContentHash: false,
        abiContentTypes: [],
        interfaceIds: [],
        // V2 cannot replay name records. Probe even without indexed history.
        hasName: true,
      },
    ])
  }
  return ResultAsync.combine([
    bulkRecords
      .andThen((records) => {
        const bulkKeys = getV1ProfileKeysFromLookup({
          source,
          lookup: records.get(source.name.toLowerCase()),
          chainId: envConfig.chain.id,
          nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
        })
        return bulkKeys
          ? okAsync([bulkKeys])
          : retryStale(
              () =>
                bigname.resolverRecords(
                  envConfig.chain.id,
                  source.resolver.toLowerCase(),
                  chainId === envConfig.chain.id &&
                    hasKnownContentHashGetter({
                      resolver: source.resolver,
                      chainId,
                    })
                    ? { name: source.name, values: false }
                    : {
                        name: source.name,
                        include: ['inventory'],
                        keys: ['contenthash'],
                      },
                  { signal },
                ),
              isStale,
            )
              .map(({ data }): NameRecords | null => data)
              .orElse((error) =>
                // Not indexed at this resolver: left out, so the caller fails closed.
                error.code === 'not_found'
                  ? okAsync<NameRecords | null, BignameError>(null)
                  : errAsync(error),
              )
              .map((data) => (data ? toV1ProfileKeys(source.id, data) : []))
      })
      .orTee(onFailure),
    readSupplementalKeys(source, signal).orTee(onFailure),
  ] as const).map(([keys, supplemental]) =>
    keys.map((key) => ({
      ...key,
      interfaceIds: supplemental.interfaceIds,
      ...((key.hasName || supplemental.hasName) && { hasName: true }),
    })),
  )
}

export const getV1ProfileKeys = ResultFn(async function* (
  sources: readonly V1ProfileSource[],
  options: { readonly signal?: AbortSignal; readonly chainId?: number } = {},
) {
  const toError = (cause: BignameError | Error) =>
    new GetV1ProfilesError({ cause })
  yield* checkNotAborted(options.signal, toError)
  const names =
    options.chainId === envConfig.chain.id
      ? [
          ...new Set(
            sources
              .filter(
                (source) =>
                  !isAddressOnlyResolver(source.resolver, envConfig.chain.id),
              )
              .map(({ name }) => name),
          ),
        ]
      : []
  // An unavailable batch optimization still requires each original source read.
  const bulkRecords = lookupNameRecords(bigname.lookup, names, options)
    .map<ReadonlyMap<string, LookupNameRecord>>(
      (rows) =>
        new Map(rows.map((row) => [row.record.name.toLowerCase(), row])),
    )
    .orElse(() => okAsync(new Map<string, LookupNameRecord>()))
  // A rolling queue avoids waiting for the slowest name in each group. History
  // starts alongside lookup; source inventory still waits for its matching proof.
  const queue = sources.entries()
  let hasFailed = false
  const stop = () => {
    hasFailed = true
  }
  const readNext = ResultFn(async function* () {
    let rows: readonly {
      readonly index: number
      readonly keys: readonly V1ProfileKeys[]
    }[] = []
    while (!hasFailed) {
      yield* checkNotAborted(options.signal, toError)
      const next = queue.next()
      if (next.done) break
      const [index, source] = next.value
      const result = await readProfileKeys(
        source,
        bulkRecords,
        stop,
        options.signal,
        options.chainId,
      )
      const keys = yield* result.mapErr(toError)
      rows = [...rows, { index, keys }]
    }
    return ok(rows)
  })
  const rows = yield* ResultAsync.combine(
    Array.from({ length: Math.min(CONCURRENT_READS, sources.length) }, () =>
      readNext(),
    ),
  )
  return ok(
    rows
      .flat()
      .sort((a, b) => a.index - b.index)
      .flatMap(({ keys }) => keys),
  )
})
