import { type HistoryEvent, timestampToSeconds } from '@ens-apps/bigname'
import type { SubgraphEvent } from './groupEventsByTransactionId'

/** A `data` value as the events table prints it: a contract by its address, a list joined. */
const flatten = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value !== null && 'address' in value)
    return value.address
  return value
}

/** A row's `include=data` payload as flat, printable fields. */
export const flattenHistoryData = (
  data: HistoryEvent['data'],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [key, flatten(value)]),
  )

/**
 * `{txHash}-{logIndex}`: how the events table finds an event's log in the
 * transaction receipt (see `parseEventLogIndex`).
 */
export const historyEventLogId = (row: HistoryEvent): string =>
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
