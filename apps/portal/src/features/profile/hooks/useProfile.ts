import type { BignameError } from '@ens-apps/indexer/bigname'
import { parseRecordKey, type RecordInventory } from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { getRecordKeys as getResolverRecordKeys } from '@ensdomains/ensjs/public/v2'
import { errAsync, fromPromise, ok, okAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLegacyRegistryResolver } from '@/utils/ens/getLegacyRegistryResolver'
import { getRecords } from './useRecords'

class GetProfileError extends TaggedError('GetProfileError')<{
  cause: BignameError
}> {}

class GetLegacyResolverError extends TaggedError('GetLegacyResolverError')<{
  readonly cause: unknown
}> {}

type GetProfileParameters = {
  readonly name: string
}

const DEFAULT_COINS = [
  // EVM
  coinNameToTypeMap.eth,
  // ENSIP-19 default address, so a fresh write shows before bigname lists it
  coinNameToTypeMap.default,
  coinNameToTypeMap.arb1,
  coinNameToTypeMap.op,
  coinNameToTypeMap.base,
  // Non-EVM
  coinNameToTypeMap.btc,
  coinNameToTypeMap.doge,
  coinNameToTypeMap.sol,
  coinNameToTypeMap.strk,
]

const DEFAULT_TEXTS = [
  'name',
  'description',
  'com.twitter',
  'org.telegram',
  'header',
  'avatar',
]

const NO_KEYS: Pick<RecordInventory, 'known_keys' | 'unsupported_keys'> = {
  known_keys: [],
  unsupported_keys: [],
}

/** The text keys and coin types in bigname's `text:`/`addr:` record keys. */
export const parseRecordKeys = (keys: readonly string[]) => {
  const parsed = keys.flatMap((key) => parseRecordKey(key) ?? [])
  return {
    texts: parsed.flatMap((key) =>
      match(key)
        .with({ kind: 'avatar' }, () => ['avatar'])
        .with({ kind: 'text' }, ({ key }) => [key])
        .otherwise(() => []),
    ),
    coins: parsed.flatMap((key) => (key.kind === 'addr' ? [key.coinType] : [])),
  }
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values))

// bigname lists the keys a resolver has set, across both eras; the values are
// read on-chain. A key it cannot serve is still read, and a name it has not
// indexed reads only the defaults.
const getRecordKeys = (name: string) =>
  bigname
    .nameRecords(name, { namespace: 'ens', include: ['inventory'] })
    .map(({ data }) => ({
      ...parseRecordKeys([
        ...(data.inventory ?? NO_KEYS).known_keys,
        ...(data.inventory ?? NO_KEYS).unsupported_keys,
      ]),
      indexedResolver: (data.resolver?.address ?? null) as Address | null,
    }))
    .orElse((error) =>
      error.code === 'not_found'
        ? okAsync({
            ...parseRecordKeys([]),
            indexedResolver: undefined,
          })
        : errAsync(new GetProfileError({ cause: error })),
    )

/**
 * Whether the resolver that answered is one bigname does not attribute to the
 * name, so its keys must come from the resolver itself. An ENSv1 subname left
 * behind by an upgraded parent resolves through the parent's resolver.
 */
export const isUnindexedResolver = ({
  indexedResolver,
  answeringResolver,
}: {
  /** `undefined` when bigname has not indexed the name at all. */
  readonly indexedResolver: Address | null | undefined
  readonly answeringResolver: Address | undefined
}): boolean =>
  indexedResolver !== undefined &&
  !!answeringResolver &&
  answeringResolver !== zeroAddress &&
  (indexedResolver === null ||
    !isAddressEqual(indexedResolver, answeringResolver))

const NO_RECORD_KEYS = parseRecordKeys([])

/** The keys read from the resolver's own logs, for when bigname can't answer. */
const getRecordKeysOnChain = (name: string, resolver: Address) =>
  safeGetClient()
    .asyncAndThen((client) =>
      fromPromise(
        getResolverRecordKeys(client, { resolverAddress: resolver, name }),
        (cause) => cause,
      ),
    )
    .map(({ texts, coinTypes }) =>
      parseRecordKeys([
        ...texts.map((key) => `text:${key}`),
        ...coinTypes.map((coinType) => `addr:${coinType}`),
      ]),
    )
    .orElse(() => okAsync(NO_RECORD_KEYS))

/** Keys a wildcard resolver (e.g. an upgraded parent's) holds for the name; bigname serves them per resolver. */
const getWildcardRecordKeys = ({
  name,
  indexedResolver,
  answeringResolver,
}: {
  readonly name: string
  readonly indexedResolver: Address | null | undefined
  readonly answeringResolver: Address | undefined
}) =>
  answeringResolver &&
  isUnindexedResolver({ indexedResolver, answeringResolver })
    ? bigname
        .resolverRecords(envConfig.chain.id, answeringResolver.toLowerCase(), {
          name,
          values: false,
          include: ['inventory'],
        })
        .map(({ data }) =>
          parseRecordKeys([
            ...(data.inventory ?? NO_KEYS).known_keys,
            ...(data.inventory ?? NO_KEYS).unsupported_keys,
          ]),
        )
        .orElse(() => getRecordKeysOnChain(name, answeringResolver))
    : okAsync(NO_RECORD_KEYS)

/** The request with the extra keys added, or `undefined` when they add none. */
const withExtraKeys = <
  T extends {
    readonly texts: readonly string[]
    readonly coins: readonly number[]
  },
>(
  request: T,
  extra: {
    readonly texts: readonly string[]
    readonly coins: readonly number[]
  },
): T | undefined => {
  const texts = unique([...request.texts, ...extra.texts])
  const coins = unique([...request.coins, ...extra.coins])
  return texts.length === request.texts.length &&
    coins.length === request.coins.length
    ? undefined
    : { ...request, texts, coins }
}

export const getProfile = ResultFn(async function* ({
  name,
}: GetProfileParameters) {
  const keys = yield* getRecordKeys(name)

  const request = {
    name,
    coins: unique([...keys.coins, ...DEFAULT_COINS]),
    texts: unique([...keys.texts, ...DEFAULT_TEXTS]),
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  } as const

  const records = yield* getRecords(request)
  if (records.resolverAddress && records.resolverAddress !== zeroAddress) {
    const wildcardRequest = withExtraKeys(
      request,
      yield* getWildcardRecordKeys({
        name,
        indexedResolver: keys.indexedResolver,
        answeringResolver: records.resolverAddress,
      }),
    )
    if (!wildcardRequest) return ok({ records })
    // Through resolution: an ENSv2 resolver answers only `resolve()`.
    const wildcardRecords = yield* getRecords(wildcardRequest).orElse(() =>
      okAsync(records),
    )
    return ok({ records: wildcardRecords })
  }

  // No resolver answered, which a lapsed ENSv1 name hits for the 28 days
  // between its v2 reservation expiring and its v1 grace ending. Its records
  // are still on the resolver the legacy registry names.
  const client = yield* safeGetClient()
  const legacyResolver = yield* fromPromise(
    getLegacyRegistryResolver(client, name),
    (cause) => new GetLegacyResolverError({ cause }),
  )
  if (!legacyResolver) return ok({ records })

  const legacyRecords = yield* getRecords({
    ...request,
    resolver: { address: legacyResolver },
  })

  return ok({ records: legacyRecords })
})

export const profileQueryKey = createQueryKey<'profile', GetProfileParameters>(
  'profile',
)

export const getProfileQueryOptions = ({ name }: GetProfileParameters) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, params] }) => getProfile(params),
  })
