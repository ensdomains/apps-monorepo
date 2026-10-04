import type {
  HistoryEvent,
  HistoryEventType,
  LookupRecord,
  NameDetail,
  NameProfile,
  ResolverAliasEvent,
  ResolverAliasRow,
} from './types'

/** True for a supported profile; `false` means `status=unsupported` (identity only). */
export const isNameProfile = (
  detail: NameDetail | LookupRecord,
): detail is NameProfile => detail.status !== 'unsupported'

/** Alias-event rows carry `from_name`; binding rows are plain name identities. */
export const isResolverAliasEvent = (
  row: ResolverAliasRow,
): row is ResolverAliasEvent => 'from_name' in row

/** Narrow a history row to one `type` so `data` gets that type's payload. */
export const isHistoryEventOfType = <TType extends HistoryEventType>(
  event: HistoryEvent,
  type: TType,
): event is Extract<HistoryEvent, { type: TType }> => event.type === type
