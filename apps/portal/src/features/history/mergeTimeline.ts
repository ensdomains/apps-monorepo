import { dropClippedBoundary } from './dropClippedBoundary'
import type { TimelineIndexerEvent } from './timelineEvent'

type MergeTimelineParameters = {
  /** The paged source, newest first. The only one with a cursor. */
  readonly pagedEvents: readonly TimelineIndexerEvent[]
  /** Sources read once and whole: v1 history, a parent's child registrations. */
  readonly auxiliaryEvents?: readonly TimelineIndexerEvent[]
  readonly hasNextPage: boolean
}

/**
 * Merge the paged source with the unpaged ones beside it, newest first.
 *
 * **The horizon.** While more pages remain, the feed is only complete down to
 * the oldest fully-loaded transaction. An auxiliary event older than that would
 * render *below* history not yet fetched — a v1 registration sitting under a gap
 * where unloaded v2 rows belong — so it is withheld until paging reaches past it.
 *
 * The id dedupe is insurance: the sources cannot actually overlap, since a
 * child's `LabelRegistered` carries the child's namehash and v1 ids come from a
 * different service.
 */
export const mergeTimeline = ({
  pagedEvents,
  auxiliaryEvents = [],
  hasNextPage,
}: MergeTimelineParameters): readonly TimelineIndexerEvent[] => {
  const paged = dropClippedBoundary(pagedEvents, hasNextPage)
  // `-Infinity` shows everything; `+Infinity` withholds everything, for the page
  // that trims to nothing — nothing there is provably complete, and reading that
  // as "fully loaded" would dump the whole v1 history on screen.
  const horizon = hasNextPage
    ? (paged.at(-1)?.timestamp ?? Number.POSITIVE_INFINITY)
    : Number.NEGATIVE_INFINITY

  const seen = new Set(paged.map((event) => event.id))
  return [
    ...paged,
    ...auxiliaryEvents.filter(
      (event) => event.timestamp >= horizon && !seen.has(event.id),
    ),
  ].sort((a, b) => b.timestamp - a.timestamp)
}
