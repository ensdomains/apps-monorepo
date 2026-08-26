import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'
import { truncateToTransactions } from './truncateToTransactions'

type MergeTimelineParameters = {
  readonly v2Events: readonly TimelineIndexerEvent[]
  readonly v1Events: readonly TimelineIndexerEvent[]
  /** The per-source page size the two collections were fetched with. */
  readonly first: number
  readonly orderDirection: 'asc' | 'desc'
  /** The v2 indexer's `eventsCount`, or `undefined` on a scoped read. */
  readonly eventsCount: number | undefined
}

/**
 * The feed plus what callers need to describe the history behind it.
 *
 * `totalCount` is read from the indexer's `eventsCount` rather than the length
 * of `events`, which is bounded by `first` — a preview that renders a handful
 * of rows still needs to say how much history there is behind them. It is
 * `undefined` on a scoped read, where that count describes the name's whole
 * history and not the events beside it.
 *
 * It counts v2 events only. The v1 subgraph exposes no total, and adding the
 * number of v1 events *fetched* would make the figure move with `first` (it
 * bounds each v1 collection separately) rather than describe the name. So
 * `hasV1History` marks the counts that are known to under-report: callers
 * should hide the figure rather than print a number that omits a name's whole
 * v1 past.
 */
export type NameHistoryTimeline = {
  readonly events: TimelineIndexerEvent[]
  readonly totalCount: number | undefined
  /** Whether history exists beyond this window. */
  readonly hasMore: boolean
  /** Whether any v1 event was merged in, i.e. `totalCount` is incomplete. */
  readonly hasV1History: boolean
}

/**
 * Merge the two protocols' events into one newest-first feed of whole
 * transactions.
 *
 * `first` bounds each source's query independently — one v2 collection plus one
 * v1 collection per registry / registrar / resolver-the-name-ever-used — so the
 * merge can hold several times it. Truncation happens on transaction boundaries
 * because `summarizeEvents` groups by transaction: a half-included transaction
 * would be summarized from a subset of its events.
 *
 * Truncate from the same end the caller ordered by: an `asc` request wants the
 * name's *earliest* transactions, so cutting the tail off a desc-sorted merge
 * would drop exactly what it asked for. Events always come back newest-first
 * regardless, since that is the order the timeline renders.
 */
export const mergeTimeline = ({
  v2Events,
  v1Events,
  first,
  orderDirection,
  eventsCount,
}: MergeTimelineParameters): NameHistoryTimeline => {
  const merged = [...v2Events, ...v1Events].sort((a, b) =>
    orderDirection === 'asc'
      ? a.timestamp - b.timestamp
      : b.timestamp - a.timestamp,
  )
  const kept = truncateToTransactions(merged, first)

  return {
    events:
      orderDirection === 'asc'
        ? [...kept].sort((a, b) => b.timestamp - a.timestamp)
        : kept,
    // Callers cannot work this out from `events.length`, because truncating on
    // a transaction boundary routinely returns fewer than `first` from a window
    // that was in fact full, so a saturated read looks like a complete one from
    // outside.
    //
    // `totalCount` answers the same question for v2 only — a v1-only name
    // reports 0 — so this is the sole completeness signal for those names.
    //
    // It errs toward `true`: a window filled exactly by the name's oldest
    // transaction reads as saturated without anything being left behind. That
    // costs a "see full history" break that leads somewhere truthful, where
    // erring the other way would hide history and claim the name has none.
    hasMore: merged.length >= first || merged.length > kept.length,
    totalCount: eventsCount,
    hasV1History: v1Events.length > 0,
  }
}
