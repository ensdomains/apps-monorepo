import { dropClippedBoundary } from './dropClippedBoundary'
import type { TimelineIndexerEvent } from './timelineEvent'

type MergeTimelineParameters = {
  /**
   * Events loaded from the paged source, in connection order (newest first).
   * Only this source has a cursor, so it alone decides how far back the feed
   * can be trusted.
   */
  readonly pagedEvents: readonly TimelineIndexerEvent[]
  /**
   * Events from sources that are read once and in full — a name's v1 subgraph
   * history, and the child registrations attributed to a parent. They have no
   * cursor of their own, so they are held back to the horizon rather than
   * appearing beneath history that has not loaded yet.
   */
  readonly auxiliaryEvents?: readonly TimelineIndexerEvent[]
  /** `pageInfo.hasNextPage` of the last loaded page. */
  readonly hasNextPage: boolean
}

/**
 * Merge one paged source with the auxiliary sources beside it into a single
 * newest-first feed.
 *
 * **The horizon.** While the paged source reports another page, the feed is only
 * complete down to its oldest fully-loaded transaction. An auxiliary event older
 * than that would render *below* history that has not been fetched yet — a v1
 * registration sitting under a gap where a dozen unloaded v2 rows belong — so
 * everything past the horizon is withheld until paging reaches back past it.
 * Loading the next page moves the horizon down and reveals them in place.
 *
 * When the paged source is exhausted there is no horizon and everything renders.
 *
 * Deduplicated by event id: an auxiliary source can legitimately overlap the
 * paged one (a child registration the parent's own feed also carries).
 *
 * Returns the renderable feed, newest first, whole transactions only.
 */
export const mergeTimeline = ({
  pagedEvents,
  auxiliaryEvents = [],
  hasNextPage,
}: MergeTimelineParameters): readonly TimelineIndexerEvent[] => {
  const paged = dropClippedBoundary(pagedEvents, hasNextPage)
  // Inclusive: the horizon transaction is whole, so events sharing its
  // timestamp belong on screen with it.
  //
  // `Infinity` covers the pathological page that trims to nothing (everything
  // loaded so far is one unfinished transaction). Nothing is provably complete
  // there, so nothing auxiliary may render — falling through to `undefined`
  // would read as "fully loaded" and dump the whole v1 history on screen.
  const horizon = hasNextPage
    ? (paged.at(-1)?.timestamp ?? Number.POSITIVE_INFINITY)
    : undefined

  const withinHorizon =
    horizon === undefined
      ? auxiliaryEvents
      : auxiliaryEvents.filter((event) => event.timestamp >= horizon)

  const seen = new Set(paged.map((event) => event.id))
  return [
    ...paged,
    ...withinHorizon.filter((event) => !seen.has(event.id)),
  ].sort((a, b) => b.timestamp - a.timestamp)
}
