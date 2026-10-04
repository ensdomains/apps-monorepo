import type {
  EventRow,
  HistoryEvent,
  HistoryEventType,
  LookupDetailRecord,
  NameDetail,
  UnsupportedName,
} from './types'

/**
 * True for a served name record; `false` means `status=unsupported` (identity
 * only on indexed reads). Works on name detail and lookup `profile=detail`
 * records.
 */
export const isNameProfile = <TRecord extends NameDetail | LookupDetailRecord>(
  record: TRecord,
): record is Exclude<TRecord, UnsupportedName> =>
  record.status !== 'unsupported'

/** Narrow a history or event row to one `type` so `data` gets that type's payload. */
export const isHistoryEventOfType = <
  TEvent extends HistoryEvent | EventRow,
  TType extends HistoryEventType,
>(
  event: TEvent,
  type: TType,
): event is Extract<TEvent, { readonly type: TType }> => event.type === type
