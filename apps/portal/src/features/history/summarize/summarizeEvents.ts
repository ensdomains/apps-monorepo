import type { Hex } from 'viem'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { DESCRIPTORS, FALLBACK_ICON, humanizeType } from './descriptors'
import { RECIPES } from './recipes'
import type { Action, DescriptorContext } from './summarize.types'

/** Event types that never surface as their own action (nor as filter options). */
export const IGNORED_TYPES = new Set(['CommitmentMade'])

/**
 * Significance ranking used to pick the "primary" event that drives an action's
 * label when several events share a transaction (e.g. Register subname bundles
 * LabelRegistered + Transfer + RolesChanged → the register is primary).
 */
const TYPE_RANK: Record<string, number> = {
  NameRegistered: 100,
  LabelRegistered: 95,
  NameRenewed: 90,
  SubregistryUpdated: 80,
  RegistryTransfer: 78,
  Transfer: 70,
  ResolverUpdated: 60,
  EACRolesChanged: 55,
  NameWrapped: 50,
  NameUnwrapped: 50,
  ReverseClaimed: 46,
  NameChanged: 44,
  AddressChanged: 40,
  AddrChanged: 40,
  TextChanged: 30,
  ContenthashChanged: 30,
  FusesSet: 20,
  ExpiryUpdated: 20,
}

const rankOf = (event: TimelineIndexerEvent): number =>
  TYPE_RANK[event.type] ?? 0

/** Group events by transaction hash, preserving encounter order. */
export const groupByTransaction = (
  events: readonly TimelineIndexerEvent[],
): TimelineIndexerEvent[][] => {
  const groups = new Map<string, TimelineIndexerEvent[]>()
  for (const event of events) {
    const key = event.transactionHash.toLowerCase()
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }
  return [...groups.values()]
}

const distinctTxHashes = (events: readonly TimelineIndexerEvent[]): Hex[] => [
  ...new Set(events.map((event) => event.transactionHash)),
]

/**
 * Build the label/slots/icon for a group: try recipes first, then the highest-ranked
 * event whose descriptor produces a result, else a humanized fallback.
 */
const describeGroup = (
  group: readonly TimelineIndexerEvent[],
  byRank: readonly TimelineIndexerEvent[],
): Pick<Action, 'icon' | 'label' | 'slots'> => {
  const ctxFor = (primary: TimelineIndexerEvent): DescriptorContext => ({
    primary,
    events: group,
  })

  for (const recipe of RECIPES) {
    const result = recipe(group, ctxFor(byRank[0]))
    if (result) return result
  }

  for (const primary of byRank) {
    const descriptor = DESCRIPTORS[primary.type]
    const built = descriptor?.build(ctxFor(primary))
    if (built) return { ...built, icon: built.icon ?? descriptor.icon }
  }

  const primary = byRank[0]
  return { icon: FALLBACK_ICON, label: humanizeType(primary.type), slots: [] }
}

/**
 * Turn a flat list of raw indexer events into tier-1 semantic actions.
 * v1 groups strictly by transaction; multi-transaction actions (primary name) are a
 * documented follow-up (recipes.ts) and currently render as separate actions.
 */
export const summarizeEvents = (
  events: readonly TimelineIndexerEvent[],
): Action[] => {
  const relevant = events.filter((event) => !IGNORED_TYPES.has(event.type))

  const actions = groupByTransaction(relevant).map((group): Action => {
    const byRank = [...group].sort((a, b) => rankOf(b) - rankOf(a))
    const primary = byRank[0]
    return {
      id: `${primary.transactionHash}:${primary.id}`,
      timestamp: Math.max(...group.map((event) => event.timestamp)),
      txHashes: distinctTxHashes(group),
      events: group,
      ...describeGroup(group, byRank),
    }
  })

  return actions.sort((a, b) => b.timestamp - a.timestamp)
}
