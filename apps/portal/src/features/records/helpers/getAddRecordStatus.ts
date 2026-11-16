import { match } from 'ts-pattern'
import {
  getAddressRecordCoinType,
  type RecordType,
} from '@/utils/records/editRecordUtils'
import { validateRecord } from '@/utils/records/validateRecord'

type AddRecordInput = {
  readonly type: RecordType | ''
  readonly key: string
  readonly value: string
}

/** Incomplete rows are still being filled in; invalid rows hold input that can never be added. */
export type AddRecordStatus =
  | { readonly status: 'ready' }
  | { readonly status: 'incomplete'; readonly reason: string }
  | { readonly status: 'invalid'; readonly message: string }

const READY: AddRecordStatus = { status: 'ready' }

const incomplete = (reason: string): AddRecordStatus => ({
  status: 'incomplete',
  reason,
})

const getAddressStatus = (key: string, value: string): AddRecordStatus => {
  if (!key.trim()) return incomplete('Select a coin.')
  const coinType = getAddressRecordCoinType(key)
  if (coinType.isErr())
    return { status: 'invalid', message: coinType.error.message }
  if (!value.trim()) return incomplete('Enter an address.')

  // The same check the table runs once the row is added, so the two cannot disagree.
  const message = validateRecord({
    type: 'address',
    key,
    value,
    id: coinType.value,
    isNew: true,
  })
  return message === null ? READY : { status: 'invalid', message }
}

export const getAddRecordStatus = ({
  type,
  key,
  value,
}: AddRecordInput): AddRecordStatus =>
  match(type)
    .with('', () => incomplete('Select a record type.'))
    .with('text', () => {
      if (!key.trim()) return incomplete('Enter a key.')
      if (!value.trim()) return incomplete('Enter a value.')
      return READY
    })
    .with('address', () => getAddressStatus(key, value))
    .with('abi', 'contentHash', () => READY)
    .exhaustive()

export type AddRecordFeedback = {
  /** Why Add record is disabled, for its tooltip; null when it can be added. */
  readonly disabledReason: string | null
  /** An inline error, only for invalid input the user has finished entering. */
  readonly error: string | null
}

export const getAddRecordFeedback = (
  addRecordStatus: AddRecordStatus,
  isValueTouched: boolean,
): AddRecordFeedback =>
  match(addRecordStatus)
    .with({ status: 'ready' }, () => ({ disabledReason: null, error: null }))
    .with({ status: 'incomplete' }, ({ reason }) => ({
      disabledReason: reason,
      error: null,
    }))
    .with({ status: 'invalid' }, ({ message }) => ({
      disabledReason: message,
      error: isValueTouched ? message : null,
    }))
    .exhaustive()
