import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { getCoderFromCoin } from '@ensdomains/ensjs/utils'
import { fromThrowable } from 'neverthrow'
import { mainProfileRecords } from '../data/records'

type ProfileRecordKeys = {
  readonly texts: readonly string[]
  readonly coins: readonly number[]
}

const parseKnownKeys = (keys: readonly string[]) => ({
  texts: keys.flatMap((key) =>
    key.startsWith('text:') ? [key.slice('text:'.length)] : [],
  ),
  coins: keys.flatMap((key) => {
    const coinType = key.startsWith('addr:')
      ? Number(key.slice('addr:'.length))
      : Number.NaN
    return Number.isSafeInteger(coinType) ? [coinType] : []
  }),
})

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values))

const safeGetCoderFromCoin = fromThrowable(getCoderFromCoin, () => undefined)

const isSupportedCoinType = (coinType: number): boolean =>
  safeGetCoderFromCoin(coinType).isOk()

/** The main profile keys, the keys bigname vouches for, and text keys already held. */
export const selectProfileRecordKeys = (
  inventory: RecordInventory | undefined,
  heldTextKeys: readonly string[] = [],
): ProfileRecordKeys => {
  // bigname leaves known_keys empty when it can't vouch for the resolver's keys.
  const knownKeys = parseKnownKeys(inventory?.known_keys ?? [])
  return {
    // Held keys cover a just-saved custom key the index hasn't caught up with yet.
    texts: unique([
      ...mainProfileRecords.texts,
      ...knownKeys.texts,
      ...heldTextKeys,
    ]),
    coins: unique([...mainProfileRecords.coins, ...knownKeys.coins]).filter(
      isSupportedCoinType,
    ),
  }
}

type TextRecord = { readonly key: string; readonly value: string }

/** Cached texts with the saved custom records in place, so the next read holds their keys. */
export const withSavedCustomTexts = (
  texts: readonly TextRecord[],
  customRecords: readonly TextRecord[],
): TextRecord[] => {
  const saved = customRecords.filter(
    ({ key, value }) => key.trim() !== '' && value.trim() !== '',
  )
  const savedKeys = new Set(saved.map(({ key }) => key))
  return [...texts.filter(({ key }) => !savedKeys.has(key)), ...saved]
}
