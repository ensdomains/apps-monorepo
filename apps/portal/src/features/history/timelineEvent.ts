import {
  type EventRow,
  type HistoryEvent,
  type HistoryEventDataByType,
  type HistoryEventType,
  timestampToSeconds,
} from '@ens-apps/bigname'
import type { Address, Hex } from 'viem'

/**
 * bigname's closed history vocabulary, in its canonical order. Every history
 * row is one of these; the raw storage kind behind it (`LabelRegistered`,
 * `RecordChanged`, …) rides along as `kind` when the read asks for `include=raw`.
 */
export const HISTORY_EVENT_TYPES = [
  'registration',
  'renewal',
  'release',
  'expiry',
  'transfer',
  'authority',
  'resolver',
  'record',
  'primary_name',
  'permission',
  'subregistry',
  'migration',
] as const satisfies readonly HistoryEventType[]

export type { HistoryEventType }

type TimelineEventBase = {
  /** bigname's opaque row identity: unique per row, stable across pages. */
  readonly id: string
  /** Raw storage kind (`include=raw`), e.g. `LabelRegistered`, `RecordVersionChanged`. */
  readonly kind?: string
  /**
   * The name the row concerns. On a name's own history this is that name; on a
   * child registration row (`subject: 'child'`) or a contract feed, the row's name.
   * Empty for a record write bigname could not attribute to a name.
   */
  readonly name: string
  readonly subject?: 'name' | 'child'
  readonly registrationId: string | null
  /**
   * Null for rows derived from interpreter state rather than one log — a lapse
   * after grace (`release`) or an expiry reached at a block boundary.
   */
  readonly transactionHash: Hex | null
  readonly blockNumber: number
  readonly logIndex: number | null
  /** Unix seconds. */
  readonly timestamp: number
  /** The emitting contract; absent for state-derived rows. */
  readonly contractAddress?: Address
}

/** One history row, discriminated on its friendly `type`. */
export type TimelineEvent = {
  readonly [TType in HistoryEventType]: TimelineEventBase & {
    readonly type: TType
    readonly data: HistoryEventDataByType[TType]
  }
}[HistoryEventType]

export type TimelineEventOfType<TType extends HistoryEventType> = Extract<
  TimelineEvent,
  { readonly type: TType }
>

/**
 * A bigname history row as the timeline renders it: unix-second timestamp,
 * camel-cased fields, `data` always present. A row with no chain position has
 * nowhere to sit on a timeline and is dropped. Name history rows always carry
 * `name`; contract-feed rows (`/v1/events`) can omit it.
 *
 * `type` is passed through even when it is newer than `HISTORY_EVENT_TYPES`:
 * every dispatcher over it falls back to a generic rendering rather than
 * dropping or crashing on a type bigname adds later.
 */
const toTimelineEvent = (
  row: HistoryEvent | EventRow,
): TimelineEvent | undefined => {
  const timestamp = timestampToSeconds(row.timestamp)
  if (row.block_number === null || timestamp === undefined) return undefined
  return {
    id: row.id,
    type: row.type,
    ...(row.kind && { kind: row.kind }),
    name: row.name ?? '',
    ...('subject' in row && row.subject && { subject: row.subject }),
    registrationId: row.registration_id,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: row.log_index,
    timestamp,
    ...(row.contract_address && { contractAddress: row.contract_address }),
    data: row.data ?? {},
  } as TimelineEvent
}

export const toTimelineEvents = (
  rows: readonly (HistoryEvent | EventRow)[],
): TimelineEvent[] => rows.flatMap((row) => toTimelineEvent(row) ?? [])

const KNOWN_TYPES: ReadonlySet<string> = new Set(HISTORY_EVENT_TYPES)

/**
 * Whether the portal knows how to word this row's type. A row of a type bigname
 * added after this list is still shown, through the generic fallbacks.
 */
export const isKnownHistoryEventType = (
  type: string,
): type is HistoryEventType => KNOWN_TYPES.has(type)

/**
 * The key a row is grouped into an action by: its transaction, or the row itself
 * when it has none (a state-derived row is an action of its own).
 */
export const timelineGroupKey = (event: TimelineEvent): string =>
  event.transactionHash?.toLowerCase() ?? `row:${event.id}`
