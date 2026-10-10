import { toDate } from '@ens-apps/indexer/bigname'
import { formatHistoryAmount } from '@/utils/history/historyPayment'
import { rootPermissionRegistry } from '@/utils/history/rootPermission'
import { isObject } from '@/utils/isObject'
import { historyTokenId } from '../historyTokenId'
import {
  type EventType,
  isKnownHistoryEventType,
  type TimelineEvent,
} from '../timelineEvent'

/**
 * Types of the fields bigname's `include=data` payload carries, per friendly
 * type. `data` is translated state, not the raw log, so these describe the
 * served value (`expires_at` is a decimal Unix-seconds instant, shown as a
 * date; a contract is its address). `token_id` is served on ENSv2 registry
 * rows after v0.4.1 and derived from the name on ENSv1 ones (see
 * `historyTokenId`); `canonical_id`, the payment fields and `operator` are
 * served after v0.4.1 only.
 */
const PAYMENT_FIELD_TYPES = {
  cost: 'uint256',
  payment_token: 'address',
  referrer: 'bytes32',
}

const FIELD_TYPES: Record<EventType, Record<string, string>> = {
  registration: {
    registrant: 'address',
    owner: 'address',
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    resolver: 'address',
    subregistry: 'address',
    action_id: 'string',
    action_role: 'string',
    token_id: 'uint256',
    canonical_id: 'uint256',
    base_cost: 'uint256',
    premium: 'uint256',
    ...PAYMENT_FIELD_TYPES,
  },
  renewal: {
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    canonical_id: 'uint256',
    ...PAYMENT_FIELD_TYPES,
  },
  release: {
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    canonical_id: 'uint256',
  },
  expiry: {
    expires_at: 'timestamp',
    expires_at_reason: 'string',
    fuses: 'uint32',
    canonical_id: 'uint256',
  },
  transfer: {
    from: 'address',
    to: 'address',
    fuses: 'uint32',
    operator: 'address',
    token_id: 'uint256',
    canonical_id: 'uint256',
  },
  authority: { owner: 'address', from: 'address' },
  resolver: { resolver: 'address', canonical_id: 'uint256' },
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
    token_id: 'uint256',
    canonical_id: 'uint256',
    // Not a served field: a root row's `grant_scope.detail.registry`.
    registry: 'address',
  },
  subregistry: { subregistry: 'address', canonical_id: 'uint256' },
  migration: { migration_path: 'string' },
}

export const getTimelineFieldType = (
  eventType: string,
  fieldKey: string,
): string =>
  (isKnownHistoryEventType(eventType)
    ? FIELD_TYPES[eventType][fieldKey]
    : undefined) ?? 'unknown'

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

/**
 * A timestamp field as an ISO instant and an amount in its currency (see
 * `formatHistoryAmount`); a value the client cannot read is shown as served.
 */
const formatField = (
  event: TimelineEvent,
  key: string,
  value: unknown,
): string => {
  if (
    getTimelineFieldType(event.type, key) === 'timestamp' &&
    typeof value === 'string'
  )
    return toDate(value)?.toISOString() ?? value
  return formatHistoryAmount(key, value, event.data) ?? stringify(value)
}

/**
 * The row's `data` fields, flattened for the decoded-parameter table. Two
 * fields can follow them: the registry of a root role change, which its
 * flattened `grant_scope` would otherwise lose, and the token id the row is
 * about when bigname did not serve one and it can be derived exactly.
 */
export const getDecodedParamEntries = (
  event: TimelineEvent,
): ReadonlyArray<readonly [string, string]> => {
  const served = Object.entries(event.data)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, formatField(event, key, value)] as const)
  const registry =
    event.type === 'permission'
      ? rootPermissionRegistry(event.data.grant_scope)
      : undefined
  const token = 'token_id' in event.data ? undefined : historyTokenId(event)
  return [
    ...served,
    ...(registry ? [['registry', registry.address] as const] : []),
    ...(token ? [['token_id', token.tokenId] as const] : []),
  ]
}
