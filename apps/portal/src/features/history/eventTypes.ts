import {
  HISTORY_EVENT_TYPES,
  type HistoryEventType,
  isKnownHistoryEventType,
  type TimelineEvent,
} from './timelineEvent'

/** Chip labels for bigname's twelve history types. */
export const HISTORY_EVENT_TYPE_LABELS: Record<HistoryEventType, string> = {
  registration: 'Registration',
  renewal: 'Renewal',
  release: 'Release',
  expiry: 'Expiry',
  transfer: 'Transfer',
  authority: 'Registry owner',
  resolver: 'Resolver',
  record: 'Record',
  primary_name: 'Primary name',
  permission: 'Permission',
  subregistry: 'Subregistry',
  migration: 'Migration',
}

/** The name-page facets, in bigname's vocabulary. */
export const OWNERSHIP_HISTORY_TYPES = [
  'registration',
  'renewal',
  'release',
  'expiry',
  'transfer',
  'authority',
  'migration',
] as const satisfies readonly HistoryEventType[]

export const RESOLVER_HISTORY_TYPES = [
  'resolver',
  'record',
] as const satisfies readonly HistoryEventType[]

export const ADDRESS_RECORD_HISTORY_TYPES = [
  'record',
] as const satisfies readonly HistoryEventType[]

/**
 * Narrows `ADDRESS_RECORD_HISTORY_TYPES` to the address records (`addr:<coin>`)
 * and the name's own `name()` record. bigname's `record_key` filter takes one
 * exact key, not a family, so this runs over loaded rows. A reset
 * (`clearRecords`, no key) wipes the addresses too, so it stays.
 */
export const isAddressRecordEvent = (event: TimelineEvent): boolean => {
  if (event.type !== 'record') return false
  const { key } = event.data
  return key === undefined || key === 'name' || key.startsWith('addr:')
}

/**
 * A facet or chip selection as a positive set of bigname types, in canonical
 * order: every narrowing here is an intersection, which `type` expresses
 * directly (`exclude_type` is for removing a type from an unfaceted read).
 * Returns `undefined` for "no narrowing", and `[]` when nothing in `types` is a
 * bigname type.
 */
export const toHistoryEventTypes = (
  types: readonly string[] | undefined,
): readonly HistoryEventType[] | undefined => {
  if (!types) return undefined
  const wanted = new Set(types.filter(isKnownHistoryEventType))
  return HISTORY_EVENT_TYPES.filter((type) => wanted.has(type))
}
