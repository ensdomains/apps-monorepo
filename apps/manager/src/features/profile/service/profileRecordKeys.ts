import type { EnsNetwork } from '@ens-apps/config'
import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { PROFILE_TEXT_RECORDS } from '@ens-apps/record-catalog/text'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { getCoderFromCoin } from '@ensdomains/ensjs/utils'
import { fromThrowable } from 'neverthrow'
import { getProfileAddressOptions } from '../data/records/addressMetadata'
import { MAIN_PROFILE_RECORD_KEYS } from '../data/records/profileReadPolicy'
import {
  PROFILE_DETAIL_RECORDS,
  STATIC_TEXT_RECORD_KEYS,
} from '../data/records/textMetadata'

type ProfileRecordKeys = {
  readonly texts: readonly string[]
  readonly coins: readonly number[]
}

const parseRecordKeys = (keys: readonly string[]) => ({
  texts: keys.flatMap((key) =>
    key.startsWith('text:') ? [key.slice('text:'.length)] : [],
  ),
  coins: keys.flatMap((key) =>
    key.startsWith('addr:') ? [Number(key.slice('addr:'.length))] : [],
  ),
})

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values))

const safeGetCoderFromCoin = fromThrowable(getCoderFromCoin, () => undefined)

const isSupportedCoinType = (coinType: number): boolean =>
  Number.isSafeInteger(coinType) && safeGetCoderFromCoin(coinType).isOk()

/** The main profile keys, plus the keys bigname vouches for. */
export const selectProfileRecordKeys = (
  inventory: RecordInventory | undefined,
): ProfileRecordKeys => {
  // bigname leaves known_keys empty when it can't vouch for the resolver's keys.
  const knownKeys = parseRecordKeys(inventory?.known_keys ?? [])
  return {
    texts: unique([...MAIN_PROFILE_RECORD_KEYS.texts, ...knownKeys.texts]),
    coins: unique([
      ...MAIN_PROFILE_RECORD_KEYS.coins,
      ...knownKeys.coins,
    ]).filter(isSupportedCoinType),
  }
}

export const selectResolverImportRecordKeys = (
  keys: readonly string[],
  network: EnsNetwork,
) => {
  const indexedKeys = parseRecordKeys(keys)
  const texts = unique([
    ...STATIC_TEXT_RECORD_KEYS,
    ...PROFILE_DETAIL_RECORDS.map(({ key }) => key),
    PROFILE_TEXT_RECORDS.links.key,
    ...indexedKeys.texts,
  ])
  const allCoins = unique([
    coinNameToTypeMap.eth,
    ...getProfileAddressOptions(network).map(({ coinType }) => coinType),
    ...indexedKeys.coins,
  ])
  const coins = allCoins.filter(isSupportedCoinType)
  const supportedCoins = new Set(coins)
  const unsupportedCoins = allCoins.filter((coin) => !supportedCoins.has(coin))
  return { texts, coins, unsupportedCoins }
}
