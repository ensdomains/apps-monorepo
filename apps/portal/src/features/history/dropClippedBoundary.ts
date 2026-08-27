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
 * A short response wasn't clipped, so it passes through. If the boundary is all
 * there is, the events are returned untrimmed — better partial than empty.
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
