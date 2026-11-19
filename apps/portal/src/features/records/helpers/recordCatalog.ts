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
  type EditableTypes,
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

/** Known text records matching `query` that the wallet may write. */
export const searchEditableTextRecords = (
  editableTypes: EditableTypes,
  query: string,
): readonly TextRecordOption[] =>
  searchTextRecords(query).filter(({ key }) =>
    canEditRecord(editableTypes, { type: 'text', key, value: '' }),
  )

/** Known coins and chains matching `query` that the wallet may write. */
export const searchEditableAddressRecords = (
  editableTypes: EditableTypes,
  query: string,
): readonly AddressRecordOption[] =>
  searchAddressRecords(query).filter((option) =>
    canEditAddressOption(editableTypes, option),
  )
