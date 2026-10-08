import { withoutDuplicateCharges } from '@/utils/history/historyPayment'
import {
  type EventType,
  isKnownHistoryEventType,
  type TimelineEvent,
  type TimelineEventOfType,
  timelineGroupKey,
} from '../timelineEvent'
import {
  describeEvent,
  descriptorIcon,
  humanizeType,
  recordFamily,
  recordTextKey,
} from './descriptors'
import type { Action, ActionSlot } from './summarize.types'

/**
 * Significance ranking used to pick the "primary" row that drives an action's
 * label when several rows share a transaction (a subname registration bundles
 * registration + transfer + permission rows → the registration is primary).
 */
const TYPE_RANK: Record<EventType, number> = {
  // A migration re-registers the name in ENSv2 in the same transaction; the
  // headline is the migration, not the registration rows it writes.
  migration: 110,
  registration: 100,
  renewal: 90,
  subregistry: 80,
  authority: 78,
  transfer: 70,
  release: 65,
  resolver: 60,
  permission: 55,
  primary_name: 46,
  record: 30,
  expiry: 20,
}

/**
 * Rank at or above which a row outranks the multi-record recipe: a transaction
 * that both registers a name and seeds its records is one "registered", not
 * "set 5 records". Deliberately above `resolver` (60) — "set the resolver and
 * write records" is still best headlined by the records.
 */
const STRUCTURAL_RANK = 70

const isRecord = (
  event: TimelineEvent,
): event is TimelineEventOfType<'record'> => event.type === 'record'

const recordLabel = (event: TimelineEventOfType<'record'>): string => {
  switch (recordFamily(event)) {
    case 'text':
      return recordTextKey(event)
    case 'contenthash':
      return 'content hash'
    case 'address':
      return 'address'
    case 'name':
      return 'name'
    case 'abi':
      return 'ABI'
    default:
      return 'record'
  }
}

const multiRecordRecipe = (
  group: readonly TimelineEvent[],
): Pick<Action, 'icon' | 'label' | 'slots'> | null => {
  const records = group
    .filter(isRecord)
    .filter((event) => recordFamily(event) !== 'cleared')
  if (records.length < 2) return null

  const MAX_SHOWN = 4
  const slots: ActionSlot[] = records
    .slice(0, MAX_SHOWN)
    .map((event) => ({ kind: 'text' as const, value: recordLabel(event) }))
  if (records.length > MAX_SHOWN) {
    slots.push({
      kind: 'connective',
      value: `+${records.length - MAX_SHOWN} more`,
    })
  }

  return { icon: 'records', label: `set ${records.length} records`, slots }
}

/** A type newer than this table ranks lowest: it can only headline alone. */
const rankOf = (event: TimelineEvent): number =>
  isKnownHistoryEventType(event.type) ? TYPE_RANK[event.type] : 0

/** Group rows by transaction (a state-derived row alone), preserving encounter order. */
const groupByTransaction = (
  events: readonly TimelineEvent[],
): TimelineEvent[][] => {
  const groups = new Map<string, TimelineEvent[]>()
  for (const event of events) {
    const key = timelineGroupKey(event)
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }
  return [...groups.values()]
}

/**
 * Build the label/slots/icon for a group: the multi-record recipe first, then the
 * highest-ranked row whose descriptor produces a result, else a humanized fallback.
 */
const describeGroup = (
  group: readonly TimelineEvent[],
  byRank: readonly TimelineEvent[],
): Pick<Action, 'icon' | 'label' | 'slots'> => {
  const built = byRank.flatMap((primary) => {
    const result = describeEvent(primary)
    return result
      ? [{ primary, ...result, icon: result.icon ?? descriptorIcon(primary) }]
      : []
  })

  if (!built[0] || rankOf(built[0].primary) < STRUCTURAL_RANK) {
    const fromRecipe = multiRecordRecipe(group)
    if (fromRecipe) return fromRecipe
  }

  if (built[0]) {
    const { primary: _primary, ...action } = built[0]
    return action
  }

  // Only a group of mints reaches here: every type has a descriptor (an
  // unknown one the generic fallback), and only the transfer one declines.
  const [first] = byRank
  return {
    icon: 'default',
    label: `emitted ${humanizeType(first.kind ?? first.type).toLowerCase()}`,
    slots: [],
  }
}

/**
 * Turn a flat list of history rows into tier-1 semantic actions, one per
 * transaction. A registration's charge is stated on one of its rows only (see
 * `withoutDuplicateCharges`), so an action never shows one payment twice.
 */
export const summarizeEvents = (
  events: readonly TimelineEvent[],
  /**
   * `includeSubjectName` leads each row with the name it concerns, for feeds
   * whose rows have different subjects (a registry's labels) — see
   * `withSubjectName`.
   */
  {
    includeSubjectName = false,
  }: { readonly includeSubjectName?: boolean } = {},
): Action[] => {
  const actions = groupByTransaction(withoutDuplicateCharges(events)).map(
    (group): Action => {
      const byRank = [...group].sort((a, b) => rankOf(b) - rankOf(a))
      const { slots, ...described } = describeGroup(group, byRank)
      const txHash = group[0].transactionHash
      return {
        id: timelineGroupKey(group[0]),
        ...(txHash && { txHash }),
        timestamp: Math.max(...group.map((event) => event.timestamp)),
        events: group,
        ...described,
        slots: includeSubjectName ? withSubjectName(slots, byRank[0]) : slots,
      }
    },
  )

  return actions.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Close the row with the name it concerns — "set roles … on zinc.eth" —
 * unless the descriptor already named something: an anonymous row in a
 * multi-subject feed is the only ambiguous case, and suffixing the others would
 * read as a duplicate.
 */
const withSubjectName = (
  slots: readonly ActionSlot[],
  primary: TimelineEvent,
): readonly ActionSlot[] => {
  if (!primary.name) return slots
  if (slots.some((slot) => slot.kind === 'name')) return slots
  return [
    ...slots,
    { kind: 'connective', value: 'on' },
    { kind: 'name', value: primary.name },
  ]
}
