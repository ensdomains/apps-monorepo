import type { RecordInventory } from '@ens-apps/indexer/reads'
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

/** The main profile keys, plus the keys the indexer vouches for. */
export const selectProfileRecordKeys = (
  inventory: RecordInventory | null,
): ProfileRecordKeys => {
  // The indexer leaves knownKeys empty when it can't vouch for the resolver's keys.
  const knownKeys = parseKnownKeys(inventory?.knownKeys ?? [])
  return {
    texts: unique([...mainProfileRecords.texts, ...knownKeys.texts]),
    coins: unique([...mainProfileRecords.coins, ...knownKeys.coins]).filter(
      isSupportedCoinType,
    ),
  }
}
