import type { AddressRecordOption } from '@ens-apps/record-catalog'
import { match } from 'ts-pattern'
import {
  type EditableRecord,
  isRecordSlotTaken,
  type RecordType,
} from '@/utils/records/editRecordUtils'

export type NewRecordKey =
  | { readonly type: 'address'; readonly coin: AddressRecordOption }
  | { readonly type: 'text'; readonly key: string }
  | { readonly type: 'abi' | 'contentHash' }

/** What the add form would stage, or undefined while its type or key is missing. */
export const getNewRecordKey = (
  type: RecordType | '',
  key: string,
  coin: AddressRecordOption | undefined,
): NewRecordKey | undefined =>
  match(type)
    .with('', () => undefined)
    .with('address', (type) => (coin ? { type, coin } : undefined))
    .with('text', (type) => (key ? { type, key } : undefined))
    .with('abi', 'contentHash', (type) => ({ type }))
    .exhaustive()

/** Why the add form cannot stage `newKey`: a saved or staged row already writes its slot. */
export const getNewRecordConflict = (
  records: readonly EditableRecord[],
  newKey: NewRecordKey | undefined,
): string | undefined =>
  match(newKey)
    .with(undefined, () => undefined)
    .with({ type: 'address' }, ({ type, coin }) =>
      isRecordSlotTaken(records, { type, id: coin.coinType })
        ? `Coin type ${coin.coinType} already has a row. Edit that row instead.`
        : undefined,
    )
    .with({ type: 'text' }, (slot) =>
      isRecordSlotTaken(records, slot)
        ? `The key “${slot.key}” already has a row. Edit that row instead.`
        : undefined,
    )
    .with({ type: 'abi' }, (slot) =>
      isRecordSlotTaken(records, slot)
        ? 'An ABI already has a row. Edit that row instead.'
        : undefined,
    )
    .with({ type: 'contentHash' }, (slot) =>
      isRecordSlotTaken(records, slot)
        ? 'A content hash already has a row. Edit that row instead.'
        : undefined,
    )
    .exhaustive()
