import type { TimelineIndexerEvent } from './timelineEvent'

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
 * Keyed on `timestamp` rather than `blockNumber` because `timestamp` is the
 * sort key, and a tie in the sort key is exactly what the indexer is free to
 * order arbitrarily. The two are interchangeable while a chain gives each block
 * its own second — they are 1:1 over every event this indexer currently serves
 * — but if that ever stops holding, trimming by block would leave a sibling
 * block the cut had also split, which is the bug this function exists to
 * prevent. Trimming by timestamp can only ever discard extra complete
 * transactions, which costs a few rows rather than a wrong headline.
 *
 * `hasMore` is the caller's answer to "did the query see the end of the feed" —
 * a definitive `pageInfo.hasNextPage`, not a guess from the page being full.
 * When it is `false` nothing was cut and every event is returned.
 *
 * Under cursor paging the trim costs nothing: whatever it discards comes back
 * with the next page.
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
