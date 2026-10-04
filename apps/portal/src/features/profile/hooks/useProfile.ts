import {
  isNameProfile,
  parseRecordKey,
  type RecordInventory,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { fromPromise, ok } from 'neverthrow'
import { zeroAddress } from 'viem'
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

/**
 * Why a name resolves to nothing although it has a registration, from name
 * detail. bigname serves `no_live_ens_v2_entry` for a `.eth` name ENSv1 decides
 * with no live ENSv2 entry: past the Universal Resolver cutover nothing below
 * it resolves, so it has no resolver or records to show.
 */
const unresolvableReasonOf = (name: string) =>
  bigname
    .getName(name)
    .then((response) =>
      response && isNameProfile(response.data)
        ? response.data.unresolvable_reason
        : undefined,
    )

/** The records of a name that resolves to nothing. */
const NO_RECORDS = {
  texts: [],
  coins: [],
  contentHash: null,
  abi: null,
  resolverAddress: zeroAddress,
}

const getProfile = ResultFn(async function* ({ name }: GetProfileParameters) {
  // The inventory only says which keys exist; the values are read on chain.
  const [recordsResponse, unresolvableReason] = yield* fromPromise(
    Promise.all([
      bigname.getNameRecords(name, { include: ['inventory'] }),
      unresolvableReasonOf(name),
    ]),
    (e) => new GetProfileError({ cause: e }),
  )

  // Reading the default keys on chain would only confirm the name resolves
  // to nothing; the page says so instead.
  if (unresolvableReason) return ok({ records: NO_RECORDS, unresolvableReason })

  const { texts, coins } = recordKeysToRead(recordsResponse?.data.inventory)

  const records = yield* getRecords({
    name,
    coins,
    texts,
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  })

  return ok({ records, unresolvableReason: undefined })
})

export const profileQueryKey = createQueryKey<'profile', GetProfileParameters>(
  'profile',
)

export const getProfileQueryOptions = ({ name }: GetProfileParameters) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile({ name }),
  })
