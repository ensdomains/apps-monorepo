import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import type { ActionSlot } from './summarize.types'

const RECORD_TYPES = new Set([
  'TextChanged',
  'AddressChanged',
  'AddrChanged',
  'ContenthashChanged',
])

const recordLabel = (event: TimelineIndexerEvent): string => {
  if (event.type === 'TextChanged')
    return event.asTextChanged?.key ?? event.key ?? 'text'
  if (event.type === 'ContenthashChanged') return 'content hash'
  return 'address'
}

/**
 * "Set N records" — a single transaction that sets multiple resolver records.
 * Collapses the group into one semantic action when ≥2 of its events are record
 * writes; returns `null` to defer to the per-event descriptor path.
 */
export const multiRecordRecipe = (
  group: readonly TimelineIndexerEvent[],
): { icon: 'records'; label: string; slots: ActionSlot[] } | null => {
  const records = group.filter((event) => RECORD_TYPES.has(event.type))
  if (records.length < 2) return null

  const MAX_SHOWN = 4
  const slots: ActionSlot[] = [
    { kind: 'connective', value: 'text' },
    ...records
      .slice(0, MAX_SHOWN)
      .map((event) => ({ kind: 'text' as const, value: recordLabel(event) })),
  ]
  if (records.length > MAX_SHOWN) {
    slots.push({
      kind: 'connective',
      value: `+${records.length - MAX_SHOWN} more`,
    })
  }

  return { icon: 'records', label: `Set ${records.length} records`, slots }
}
