import {
  type EventRow,
  type HistoryEvent,
  parseTimestamp,
  timestampToSeconds,
} from '@ens-apps/bigname'
import type { SubgraphEvent } from './groupEventsByTransactionId'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

/** An `expires_at` instant (decimal Unix seconds) as ISO; anything else as served. */
const flattenField = (key: string, value: unknown): unknown =>
  key === 'expires_at' && typeof value === 'string'
    ? (parseTimestamp(value)?.toISOString() ?? value)
    : flatten(value)

/** A row's `include=data` payload as flat, printable fields. */
export const flattenHistoryData = (
  data: HistoryEvent['data'] | EventRow['data'],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [
      key,
      flattenField(key, value),
    ]),
  )

/**
 * `{txHash}-{logIndex}`: how the events table finds an event's log in the
 * transaction receipt (see `parseEventLogIndex`).
 */
export const historyEventLogId = (row: HistoryEvent | EventRow): string =>
  `${row.transaction_hash ?? ''}-${String(row.log_index ?? '')}`

/**
 * bigname history rows in the shape the events table groups by transaction
 * (`groupEventsByTransactionId`). `id` is `{txHash}-{logIndex}`, which is how
 * the table finds the event's log in the receipt; `type` is the raw storage
 * kind when the read asked for `include=raw`; the `data` payload rides along as
 * the event's decoded fields. A row with no transaction (a state-derived lapse)
 * has nothing to group under and is left out.
 */
export const historyEventsToSubgraphEvents = (
  rows: readonly HistoryEvent[],
): (SubgraphEvent & Record<string, unknown>)[] =>
  rows.flatMap((row) => {
    const timestamp = timestampToSeconds(row.timestamp)
    if (!row.transaction_hash || row.block_number === null) return []
    return [
      {
        ...flattenHistoryData(row.data),
        id: historyEventLogId(row),
        transactionID: row.transaction_hash,
        blockNumber: row.block_number,
        type: row.kind ?? row.type,
        ...(timestamp !== undefined && { timestamp: BigInt(timestamp) }),
      },
    ]
  })
