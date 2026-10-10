import {
  type EventRow,
  type NameHistoryRow,
  toDate,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { isObject } from '@/utils/isObject'
import type { SubgraphEvent } from './groupEventsByTransactionId'
import { formatHistoryAmount, withoutDuplicateCharges } from './historyPayment'
import { rootPermissionRegistry } from './rootPermission'

/**
 * A `data` value as the events table prints it: a contract by its address, a
 * grant scope by its kind, a record value's object form by its bytes, a list
 * joined.
 */
const flatten = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.join(', ')
  if (!isObject(value)) return value
  if ('address' in value) return value.address
  if ('kind' in value) return value.kind
  if ('bytes' in value) return value.bytes
  if (isObject(value.current) && 'bytes' in value.current)
    return value.current.bytes
  return JSON.stringify(value)
}

/**
 * An `expires_at` instant (decimal Unix seconds) as ISO and an amount in its
 * currency (see `formatHistoryAmount`); anything else as served.
 */
const flattenField = (key: string, value: unknown, data: object): unknown =>
  key === 'expires_at' && typeof value === 'string'
    ? (toDate(value)?.toISOString() ?? value)
    : (formatHistoryAmount(key, value, data) ?? flatten(value))

/**
 * A row's `include=data` payload as flat, printable fields. A root role
 * change also gets its `registry`, which the flattened
 * `grant_scope` would lose and the row, having no name, has no other trace of.
 */
export const flattenHistoryData = (
  data: NameHistoryRow['data'] | EventRow['data'],
): Record<string, unknown> => {
  if (!data) return {}
  const registry =
    'grant_scope' in data ? rootPermissionRegistry(data.grant_scope) : undefined
  return {
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        flattenField(key, value, data),
      ]),
    ),
    ...(registry && { registry: registry.address }),
  }
}

/**
 * `{txHash}-{logIndex}`: how the events table finds an event's log in the
 * transaction receipt (see `parseEventLogIndex`).
 */
export const historyEventLogId = (row: NameHistoryRow | EventRow): string =>
  `${row.transaction_hash ?? ''}-${String(row.log_index ?? '')}`

/**
 * bigname history rows in the shape the events table groups by transaction
 * (`groupEventsByTransactionId`). `id` is `{txHash}-{logIndex}`, which is how
 * the table finds the event's log in the receipt; `type` is the raw storage
 * kind when the read asked for `include=raw`; the `data` payload rides along as
 * the event's decoded fields, a registration's charge on one of its rows only
 * (see `withoutDuplicateCharges`). A row with no transaction (a state-derived
 * lapse) has nothing to group under and is left out.
 */
export const historyEventsToSubgraphEvents = (
  rows: readonly NameHistoryRow[],
): (SubgraphEvent & Record<string, unknown>)[] =>
  withoutDuplicateCharges(rows).flatMap((row) => {
    const timestamp = toUnixSeconds(row.timestamp)
    if (!row.transaction_hash || row.block_number === null) return []
    return [
      {
        ...flattenHistoryData(row.data),
        id: historyEventLogId(row),
        transactionID: row.transaction_hash,
        blockNumber: row.block_number,
        type: row.kind ?? row.type,
        ...(timestamp !== null && { timestamp: BigInt(timestamp) }),
      },
    ]
  })
