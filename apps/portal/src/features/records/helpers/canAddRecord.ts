import { match } from 'ts-pattern'
import {
  getAddressRecordCoinType,
  type RecordType,
} from '@/utils/records/editRecordUtils'
import { validateRecord } from '@/utils/records/validateRecord'

export const canAddRecord = (
  type: RecordType | '',
  key: string,
  value: string,
): boolean =>
  match(type)
    .with('', () => false)
    .with('text', () => Boolean(key.trim() && value.trim()))
    .with('address', () => {
      if (!value.trim()) return false
      const coinType = getAddressRecordCoinType(key)
      if (coinType.isErr()) return false

      return (
        validateRecord({
          type: 'address',
          key,
          value,
          id: coinType.value,
          isNew: true,
        }) === null
      )
    })
    .with('abi', 'contentHash', () => true)
    .exhaustive()
