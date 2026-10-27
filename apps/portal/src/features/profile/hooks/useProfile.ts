import { parseRecordKey, type RecordInventory } from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { fromPromise, ok, okAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLegacyRegistryResolver } from '@/utils/ens/getLegacyRegistryResolver'
import { getRecords } from './useRecords'

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
    .map(({ data }) => data.inventory ?? NO_KEYS)
    // The inventory is optional discovery data. Resolve default keys even
    // when the indexer cannot serve an offchain name or is unavailable.
    .orElse(() => okAsync(NO_KEYS))
    .map((inventory) =>
      parseRecordKeys([...inventory.known_keys, ...inventory.unsupported_keys]),
    )

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
    return ok({ records })
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
