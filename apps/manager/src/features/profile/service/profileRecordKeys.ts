import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { getCoderFromCoin } from '@ensdomains/ensjs/utils'
import { fromThrowable } from 'neverthrow'
import { mainProfileRecords } from '../data/records'

export type ProfileRecordKeys = {
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

/** Whether bigname's inventory can say which keys the resolver stores; ABI-only reasons still can. */
const isAuthoritative = (
  inventory: RecordInventory | undefined,
): inventory is RecordInventory =>
  inventory !== undefined &&
  inventory.abi_unsupported_reason !== 'inventory_not_available' &&
  inventory.abi_unsupported_reason !== 'inventory_not_authoritative'

/** The main profile keys, plus the keys bigname vouches for. */
export const selectProfileRecordKeys = (
  inventory: RecordInventory | undefined,
): ProfileRecordKeys => {
  const knownKeys = parseKnownKeys(
    isAuthoritative(inventory) ? inventory.known_keys : [],
  )
  return {
    texts: unique([...mainProfileRecords.texts, ...knownKeys.texts]),
    coins: unique([...mainProfileRecords.coins, ...knownKeys.coins]).filter(
      isSupportedCoinType,
    ),
  }
}
