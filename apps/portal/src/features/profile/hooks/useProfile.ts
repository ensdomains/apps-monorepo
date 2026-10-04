import { parseRecordKey, type RecordInventory } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { getRecords } from './useRecords'

class GetProfileError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

type GetProfileParameters = {
  name: string
}

/** Records every profile asks the chain for, whatever the inventory says. */
const DEFAULT_COINS = [
  // EVM
  coinNameToTypeMap.eth,
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

/**
 * The text keys and coin types to read on chain: the defaults plus every key
 * bigname's inventory knows is set. `unsupported_keys` are keys bigname cannot
 * vouch for either way (e.g. a resolver it does not index), so they are read
 * too rather than dropped.
 */
export const recordKeysToRead = (inventory: RecordInventory | undefined) => {
  const texts = new Set<string>(DEFAULT_TEXTS)
  const coins = new Set<number>(DEFAULT_COINS)
  for (const key of [
    ...(inventory?.known_keys ?? []),
    ...(inventory?.unsupported_keys ?? []),
  ]) {
    const parsed = parseRecordKey(key)
    if (parsed?.kind === 'text') texts.add(parsed.key)
    else if (parsed?.kind === 'avatar') texts.add('avatar')
    else if (parsed?.kind === 'addr') coins.add(parsed.coinType)
  }
  return { texts: [...texts], coins: [...coins] }
}

const getProfile = ResultFn(async function* ({ name }: GetProfileParameters) {
  // The inventory only says which keys exist; the values are read on chain.
  const recordsResponse = yield* fromPromise(
    bigname.getNameRecords(name, { include: ['inventory'] }),
    (e) => new GetProfileError({ cause: e }),
  )

  const { texts, coins } = recordKeysToRead(recordsResponse?.data.inventory)

  const records = yield* getRecords({
    name,
    coins,
    texts,
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  })

  return ok({ records })
})

export const profileQueryKey = createQueryKey<'profile', GetProfileParameters>(
  'profile',
)

export const getProfileQueryOptions = ({ name }: GetProfileParameters) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile({ name }),
  })
