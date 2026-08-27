import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'

/**
 * Drop the trailing events a page boundary may have cut in half.
 *
 * The feed is paginated by event, but rendered by transaction: `summarizeEvents`
 * groups events by transaction afterwards, so a page ending inside one
 * summarizes it from a subset of its events — the wrong headline, missing detail
 * rows, and no sign anything was lost.
 *
 * Events are ordered by timestamp and every transaction carries its block's
 * timestamp, so a page boundary can only ever split the oldest timestamp in the
 * page. Everything above that timestamp has all of its events present and is
 * complete by construction; the boundary group itself may continue onto the next
 * page, so it goes.
 *
 * `hasMore` is the caller's answer to "did the query see the end of the feed" —
 * a definitive `pageInfo.hasNextPage`, not a guess from the page being full.
 * When it is `false` nothing was cut and every event is returned.
 *
 * `events` must be sorted by timestamp descending.
 */
export const dropClippedBoundary = (
  events: readonly TimelineIndexerEvent[],
  hasMore: boolean,
): readonly TimelineIndexerEvent[] => {
  if (!hasMore) return events

  const boundaryTimestamp = events.at(-1)?.timestamp
  return events.filter((event) => event.timestamp !== boundaryTimestamp)
}
