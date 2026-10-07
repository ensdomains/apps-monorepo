import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { match } from 'ts-pattern'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'

/**
 * Unified history event type for display in the record history table.
 */
export type HistoryEvent = {
  blockNumber: number
  timestamp?: number // Unix timestamp in seconds
  transactionHash: string
  type: string
  value?: string
}

/**
 * Gets the V2 event types that correspond to a record type.
 * Note: V2 indexer uses different event names than V1 (e.g., AddressChanged vs AddrChanged)
 *
 * @param record - The record to get event types for
 * @returns Array of event type strings that match the record type
 *
 * @example
 * getV2EventTypesForRecord({ type: 'text', key: 'name', value: 'John' })
 * // ['TextUpdated', 'TextChanged']
 *
 * @example
 * getV2EventTypesForRecord({ type: 'address', key: 'ETH', value: '0x...', id: 60 })
 * // ['AddressUpdated', 'AddressChanged']
 */
export const getV2EventTypesForRecord = (record: NameRecord): string[] =>
  match(record.type)
    .with('text', () => ['TextUpdated', 'TextChanged'])
    .with('address', () => ['AddressUpdated', 'AddressChanged'])
    .with('contentHash', () => ['ContenthashUpdated', 'ContenthashChanged'])
    .with('abi', () => ['ABIUpdated', 'ABIChanged'])
    .exhaustive()

/**
 * Extracts the display value from a V1 resolver event.
 *
 * @param event - The resolver event to extract value from
 * @returns The display value string or undefined
 */
const extractV1EventValue = (event: ReturnResolverEvent): string | undefined =>
  match(event)
    .with({ type: 'ContenthashChanged' }, (e) => e.contentHash ?? undefined)
    .with({ type: 'TextChanged' }, (e) => `${e.key}: ${e.value ?? 'null'}`)
    .with({ type: 'AddrChanged' }, (e) => e.addr ?? undefined)
    .with({ type: 'MulticoinAddrChanged' }, (e) => e.addr ?? undefined)
    .otherwise(() => undefined)

/**
 * Transforms V1 resolver events to the unified HistoryEvent format.
 * V1 events don't include timestamps, so they must be provided from block data.
 *
 * @param events - Array of V1 resolver events
 * @param blockTimestamps - Optional map of block numbers to timestamps
 * @returns Array of unified history events
 *
 * @example
 * const timestamps = new Map([[BigInt(12345), BigInt(1700000000)]])
 * transformV1Events([{ type: 'TextChanged', key: 'name', value: 'John', blockNumber: 12345, ... }], timestamps)
 * // [{ blockNumber: 12345, timestamp: 1700000000, type: 'TextChanged', value: 'name: John' }]
 */
export const transformV1Events = (
  events: ReturnResolverEvent[],
  blockTimestamps?: Map<bigint, bigint>,
): HistoryEvent[] =>
  events.map((event) => {
    const blockTimestamp = blockTimestamps?.get(BigInt(event.blockNumber))
    return {
      blockNumber: event.blockNumber,
      timestamp: blockTimestamp ? Number(blockTimestamp) : undefined,
      transactionHash: event.transactionID,
      type: event.type,
      value: extractV1EventValue(event),
    }
  })

/**
 * Sorts history events by timestamp (descending), falling back to block number.
 * Most recent events appear first.
 *
 * @param events - Array of history events to sort
 * @returns Sorted array (creates a new array, does not mutate input)
 *
 * @example
 * sortHistoryEvents([
 *   { blockNumber: 100, timestamp: 1000, type: 'A', value: 'a' },
 *   { blockNumber: 200, timestamp: 2000, type: 'B', value: 'b' },
 * ])
 * // [{ blockNumber: 200, timestamp: 2000, ... }, { blockNumber: 100, timestamp: 1000, ... }]
 */
export const sortHistoryEvents = (events: HistoryEvent[]): HistoryEvent[] =>
  [...events].sort((a, b) => {
    // Prefer timestamp if both events have it
    if (a.timestamp && b.timestamp) {
      return b.timestamp - a.timestamp
    }
    // Fallback to block number
    return b.blockNumber - a.blockNumber
  })
