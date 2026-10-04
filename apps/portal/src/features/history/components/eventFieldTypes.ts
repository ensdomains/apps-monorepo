import type { HistoryEventType, TimelineEvent } from '../timelineEvent'

/**
 * Types of the fields bigname's `include=data` payload carries, per friendly
 * type. `data` is translated state, not the raw log, so these describe the
 * served value (`expires_at` is an RFC 3339 instant, a contract is its address).
 */
const FIELD_TYPES: Record<HistoryEventType, Record<string, string>> = {
  registration: {
    registrant: 'address',
    owner: 'address',
    expires_at: 'timestamp',
    resolver: 'address',
    subregistry: 'address',
  },
  renewal: { expires_at: 'timestamp' },
  release: { expires_at: 'timestamp' },
  expiry: { expires_at: 'timestamp', fuses: 'uint32' },
  transfer: { from: 'address', to: 'address', fuses: 'uint32' },
  authority: { owner: 'address', from: 'address' },
  resolver: { resolver: 'address' },
  record: { key: 'string', value: 'string | bytes', coin_type: 'uint256' },
  primary_name: { address: 'address', coin_type: 'uint256' },
  permission: { address: 'address', powers: 'string[]', fuses: 'uint32' },
  subregistry: { subregistry: 'address' },
}

export const getTimelineFieldType = (
  eventType: HistoryEventType,
  fieldKey: string,
): string => FIELD_TYPES[eventType][fieldKey] ?? 'unknown'

const isContractRef = (value: unknown): value is { address: string } =>
  typeof value === 'object' &&
  value !== null &&
  'address' in value &&
  typeof value.address === 'string'

/** A payload value as one string: a contract pointer by its address, a list comma-joined. */
const stringify = (value: unknown): string => {
  if (isContractRef(value)) return value.address
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

/** The row's `data` fields, flattened for the decoded-parameter table. */
export const getDecodedParamEntries = (
  event: TimelineEvent,
): ReadonlyArray<readonly [string, string]> =>
  Object.entries(event.data)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, stringify(value)] as const)
