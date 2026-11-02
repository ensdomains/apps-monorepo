import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { getCoderFromCoin } from '@ensdomains/ensjs/utils'
import { fromThrowable } from 'neverthrow'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  offchainProfileRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'

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

/** The inventory says nothing about CCIP-Read, so ask the chain unless it lists keys to read. */
export const shouldCheckOffchain = (
  inventory: RecordInventory | undefined,
): boolean => !isAuthoritative(inventory) || !inventory.known_keys.length

export const selectProfileRecordKeys = ({
  inventory,
  isOffchain,
}: {
  readonly inventory: RecordInventory | undefined
  readonly isOffchain: boolean
}): ProfileRecordKeys => {
  // ensjs asks a gateway for every key in one request, which a URL-length limit caps.
  if (isOffchain) return offchainProfileRecords
  const knownKeys = parseKnownKeys(
    isAuthoritative(inventory) ? inventory.known_keys : [],
  )
  return {
    texts: unique([
      ...staticTextRecords,
      ...textRecords.map((record) => record.key),
      ...forceFetchRecords.always,
      ...forceFetchRecords.whenNotIndexed,
      // Newly saved links must be readable before the indexer discovers the key.
      'links',
      ...knownKeys.texts,
    ]),
    coins: unique([
      ...alwaysProbeAddressRecords.map(Number),
      ...addressRecords.map((record) => record.coinType),
      ...knownKeys.coins,
    ]).filter(isSupportedCoinType),
  }
}
