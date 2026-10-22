import type { TimelineEvent } from './timelineEvent'

/**
 * Drop the trailing rows a page boundary may have cut in half.
 *
 * The feed is paginated by row, but rendered by transaction: `summarizeEvents`
 * groups rows by transaction afterwards, so a page ending inside one summarizes
 * it from a subset of its rows — the wrong headline, missing detail rows, and
 * no sign anything was lost.
 *
 * bigname orders history by chain position (block, transaction index, log
 * index), and every row of a block carries that block's timestamp, so a page
 * boundary can only ever split the oldest timestamp in the page. Everything
 * above it is complete by construction; the boundary group itself may continue
 * onto the next page, so it goes. Trimming by timestamp rather than by
 * transaction can only discard extra complete transactions, which costs a few
 * rows rather than a wrong headline, and whatever it discards comes back with
 * the next page.
 *
 * `hasMore` is the caller's answer to "did the read see the end of the feed" —
 * bigname's `has_more`, not a guess from the page being full. When it is
 * `false` nothing was cut and every row is returned.
 *
 * `events` must be newest first.
 */
export const dropClippedBoundary = (
  events: readonly TimelineEvent[],
  hasMore: boolean,
): readonly TimelineEvent[] => {
  if (!hasMore) return events

  const boundaryTimestamp = events.at(-1)?.timestamp
  return events.filter((event) => event.timestamp !== boundaryTimestamp)
}
