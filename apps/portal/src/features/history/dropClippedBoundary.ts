import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'

/**
 * Drop events the query's `first` limit may have clipped.
 *
 * A response that came back full was cut off mid-block. Ordering is by
 * timestamp alone, so a block's transactions come back interleaved and the cut
 * can land partway through several of them at once — dropping only the last
 * event's transaction leaves the others looking complete, and `summarizeEvents`
 * then reads a partial transaction as a whole one (the wrong headline, missing
 * detail rows, no sign anything was lost).
 *
 * Every transaction shares its block's timestamp, so a transaction whose
 * timestamp is above the boundary is guaranteed whole, and every transaction
 * *at* the boundary is suspect. Trimming the whole boundary timestamp is
 * therefore the smallest cut that leaves only complete transactions.
 *
 * The cut is keyed on `timestamp` rather than `blockNumber` because `timestamp`
 * is the sort key: ties are what the indexer orders arbitrarily, so the whole
 * tied group is ambiguous. Where a chain lets two blocks share a timestamp,
 * dropping only the trailing `blockNumber` would leave a clipped sibling block
 * behind; dropping the timestamp group covers the block group as well.
 *
 * A short response wasn't clipped, so it passes through.
 *
 * If the boundary group is the entire response, nothing in it is provably
 * complete — the cut could have fallen inside any of its transactions. The
 * events are returned untrimmed anyway, because an empty Recent Activity is a
 * worse answer than a possibly-clipped one. Callers who can issue another query
 * should test for that case with {@link clippedBoundaryTimestamp} first and
 * widen, rather than rely on this fallback.
 *
 * `events` must be sorted by timestamp descending.
 */
export const dropClippedBoundary = (
  events: readonly TimelineIndexerEvent[],
  limit: number,
): readonly TimelineIndexerEvent[] => {
  if (events.length < limit) return events

  const boundaryTimestamp = events.at(-1)?.timestamp
  const complete = events.filter(
    (event) => event.timestamp !== boundaryTimestamp,
  )
  return complete.length > 0 ? complete : events
}

/**
 * The timestamp to re-query when trimming cannot salvage anything.
 *
 * Returns a value only when a full response is a single timestamp group, so
 * {@link dropClippedBoundary} would have to hand back possibly-clipped
 * transactions. Re-fetching with `timestamp_gte` at this value retrieves the
 * whole group; if that response is itself short, the group is complete and
 * nothing is clipped.
 *
 * `undefined` means the response either wasn't full or contains at least one
 * timestamp above the boundary, and trimming alone is enough.
 */
export const clippedBoundaryTimestamp = (
  events: readonly TimelineIndexerEvent[],
  limit: number,
): number | undefined => {
  if (events.length < limit) return undefined

  const boundaryTimestamp = events.at(-1)?.timestamp
  const allAtBoundary = events.every(
    (event) => event.timestamp === boundaryTimestamp,
  )
  return allAtBoundary ? boundaryTimestamp : undefined
}
