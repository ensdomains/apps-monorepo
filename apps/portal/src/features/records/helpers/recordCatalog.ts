import {
  type AddressRecordOption,
  searchAddressRecords,
} from '@ens-apps/record-catalog'
import {
  searchTextRecords,
  type TextRecordOption,
} from '@ens-apps/record-catalog/text'
import {
  canEditRecord,
  type EditableRecord,
  type EditableTypes,
  getRecordSlot,
} from '@/utils/records/editRecordUtils'

/** Whether the wallet may write the coin type `option` names. */
const canEditAddressOption = (
  editableTypes: EditableTypes,
  option: AddressRecordOption,
): boolean =>
  canEditRecord(editableTypes, {
    type: 'address',
    key: option.name,
    value: '',
    id: option.coinType,
  })

/** The picked coin while the wallet may still write it. */
export const getEditableCoin = (
  editableTypes: EditableTypes,
  coin: AddressRecordOption | undefined,
): AddressRecordOption | undefined =>
  coin && canEditAddressOption(editableTypes, coin) ? coin : undefined

const getTakenRecordSlots = (records: readonly EditableRecord[]) =>
  new Set(records.filter(({ isDeleted }) => !isDeleted).map(getRecordSlot))

/** Permitted raw text keys for the restricted editor's key selector. */
export const getAvailableTextRecordKeys = (
  keys: ReadonlySet<string>,
  records: readonly EditableRecord[],
): readonly string[] => {
  const taken = getTakenRecordSlots(records)
  return [...keys]
    .filter((key) => !taken.has(getRecordSlot({ type: 'text', key })))
    .toSorted()
}

/** Known text records matching `query` that the wallet may add. */
export const searchEditableTextRecords = (
  editableTypes: EditableTypes,
  query: string,
  records: readonly EditableRecord[],
): readonly TextRecordOption[] => {
  const taken = getTakenRecordSlots(records)
  return searchTextRecords(query).filter(
    ({ key }) =>
      canEditRecord(editableTypes, { type: 'text', key, value: '' }) &&
      !taken.has(getRecordSlot({ type: 'text', key })),
  )
}

/** Known coins and chains matching `query` that the wallet may add. */
export const searchEditableAddressRecords = (
  editableTypes: EditableTypes,
  query: string,
  records: readonly EditableRecord[],
): readonly AddressRecordOption[] => {
  const taken = getTakenRecordSlots(records)
  return searchAddressRecords(query).filter(
    (option) =>
      canEditAddressOption(editableTypes, option) &&
      !taken.has(getRecordSlot({ type: 'address', id: option.coinType })),
  )
}
