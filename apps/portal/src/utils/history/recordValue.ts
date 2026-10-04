import type { HistoryRecordValue } from '@ens-apps/bigname'

/**
 * A `record` history row's retained `value` as one printable string.
 *
 * Text values and ordinary binary values arrive as strings. The closed object
 * forms are raw bytes (`{encoding: 'hex', bytes}`), a deleted DNS record, a DNS
 * zonehash change (`{previous, current}`) and a `setData` write, of which only
 * the hash of the data is kept. A deletion reads as no value, and a data hash
 * is not the value, so neither has one.
 */
export const recordValueText = (
  value: HistoryRecordValue | undefined,
): string | undefined => {
  if (value === undefined || typeof value === 'string') return value
  if ('bytes' in value) return value.bytes
  if ('current' in value) return value.current.bytes
  return undefined
}
