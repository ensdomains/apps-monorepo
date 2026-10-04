import { parseTimestamp } from '@ens-apps/bigname'
import {
  type HistoryEventType,
  isKnownHistoryEventType,
  type TimelineEvent,
} from '../timelineEvent'

/**
 * Types of the fields bigname's `include=data` payload carries, per friendly
 * type. `data` is translated state, not the raw log, so these describe the
 * served value (`expires_at` is a decimal Unix-seconds instant, shown as a
 * date; a contract is its address).
 */
const FIELD_TYPES: Record<HistoryEventType, Record<string, string>> = {
  registration: {
    registrant: 'address',
    owner: 'address',
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    resolver: 'address',
    subregistry: 'address',
    action_id: 'string',
    action_role: 'string',
  },
  renewal: { expires_at: 'timestamp', expires_at_reason: 'string' },
  release: { expires_at: 'timestamp', expires_at_reason: 'string' },
  expiry: {
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    fuses: 'uint32',
  },
  transfer: { from: 'address', to: 'address', fuses: 'uint32' },
  authority: { owner: 'address', from: 'address' },
  resolver: { resolver: 'address' },
  record: {
    key: 'string',
    value: 'string | bytes',
    coin_type: 'uint256',
    resolver: 'address',
    node: 'bytes32',
    record_id: 'uint256',
  },
  primary_name: {
    address: 'address',
    coin_type: 'uint256',
    name: 'string',
    name_status: 'string',
  },
  permission: {
    address: 'address',
    grant_scope: 'string',
    powers: 'string[]',
    added_powers: 'string[]',
    removed_powers: 'string[]',
    approved: 'bool',
    fuses: 'uint32',
  },
  subregistry: { subregistry: 'address' },
  migration: { migration_path: 'string' },
}

export const getTimelineFieldType = (
  eventType: string,
  fieldKey: string,
): string =>
  (isKnownHistoryEventType(eventType)
    ? FIELD_TYPES[eventType][fieldKey]
    : undefined) ?? 'unknown'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * A payload value as one string: a contract pointer by its address, a grant
 * scope by its kind, a record value's object form by its bytes, a list
 * comma-joined.
 */
const stringify = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (!isObject(value)) return String(value)
  if (typeof value.address === 'string') return value.address
  if (typeof value.kind === 'string') return value.kind
  // Record values: raw bytes, or a DNS zonehash change by its new bytes.
  if (typeof value.bytes === 'string') return value.bytes
  if (isObject(value.current) && typeof value.current.bytes === 'string')
    return value.current.bytes
  return JSON.stringify(value)
}

/** A timestamp field as an ISO instant; a value the client cannot date is shown as served. */
const formatField = (
  eventType: string,
  key: string,
  value: unknown,
): string => {
  if (
    getTimelineFieldType(eventType, key) === 'timestamp' &&
    typeof value === 'string'
  )
    return parseTimestamp(value)?.toISOString() ?? value
  return stringify(value)
}

/** The row's `data` fields, flattened for the decoded-parameter table. */
export const getDecodedParamEntries = (
  event: TimelineEvent,
): ReadonlyArray<readonly [string, string]> =>
  Object.entries(event.data)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, formatField(event.type, key, value)] as const)
