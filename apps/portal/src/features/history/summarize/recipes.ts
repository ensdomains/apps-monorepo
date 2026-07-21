import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import type { ActionSlot, DescriptorContext } from './summarize.types'

/**
 * Recipes collapse a *group* of raw events into a single semantic action when the
 * default one-primary-event descriptor isn't enough (e.g. "Set 4 records"). Each
 * returns a label + slots + icon, or `null` to defer to the descriptor path.
 *
 * A recipe runs against events already grouped by transaction (see summarizeEvents).
 */
export type RecipeResult = {
  icon: 'records'
  label: string
  slots: ActionSlot[]
}
export type Recipe = (
  group: readonly TimelineIndexerEvent[],
  ctx: DescriptorContext,
) => RecipeResult | null

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
 * Matches when ≥2 of the group's events are record writes.
 */
export const multiRecordRecipe: Recipe = (group) => {
  const records = group.filter((event) => RECORD_TYPES.has(event.type))
  if (records.length < 2) return null

  const MAX_SHOWN = 4
  const slots: ActionSlot[] = records
    .slice(0, MAX_SHOWN)
    .map((event) => ({ kind: 'text', value: recordLabel(event) }))
  if (records.length > MAX_SHOWN) {
    slots.push({
      kind: 'connective',
      value: `+${records.length - MAX_SHOWN} more`,
    })
  }

  return { icon: 'records', label: `Set ${records.length} records`, slots }
}

// TODO: cross-transaction "Set primary name" recipe (forward AddrChanged + reverse
// NameChanged in separate txs). Requires correlating by target+actor within a time
// window — cannot key on transactionHash. Until then those render as separate actions.
// Ideally the indexer provides an action/correlation id (see spec §6.4).

export const RECIPES: readonly Recipe[] = [multiRecordRecipe]
