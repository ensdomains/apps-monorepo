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
 * The transaction key, cased exactly as `summarizeEvents` groups on. Both
 * sources emit lowercase hashes today, so this only keeps the two in step: a
 * source that ever returned a checksummed hash would otherwise slip past this
 * filter and then merge into the same action row.
 */
const transactionKey = (event: TimelineIndexerEvent) =>
  event.transactionHash.toLowerCase()

/**
 * Auxiliary events that the paged feed does not already carry.
 *
 * The sources overlap: the v1 subgraph indexes the same resolver writes the v2
 * indexer does, so the same on-chain transaction arrives twice in two id shapes
 * — which is what rendered `mail, phone, mail, phone` inside one action on
 * fox.eth, where 68 of 73 paged events had a v1 twin. Ids therefore cannot
 * settle it; the transaction hash can, and it is the same grouping key
 * `summarizeEvents` builds actions on, so a transaction is either the paged
 * feed's or the auxiliary source's, never half of each.
 *
 * Compared against the *untrimmed* page: the clipped boundary transaction is
 * withheld from this render, not absent from the feed, and re-adding its v1 twin
 * would duplicate it a page later.
 */
export const dropPagedDuplicates = (
  auxiliaryEvents: readonly TimelineIndexerEvent[],
  pagedEvents: readonly TimelineIndexerEvent[],
): readonly TimelineIndexerEvent[] => {
  const seenIds = new Set(pagedEvents.map((event) => event.id))
  const seenTransactions = new Set(
    pagedEvents.map((event) => transactionKey(event)),
  )
  return auxiliaryEvents.filter(
    (event) =>
      !seenIds.has(event.id) && !seenTransactions.has(transactionKey(event)),
  )
}

/**
 * Merge the paged source with the unpaged ones beside it, newest first.
 *
 * **The horizon.** While more pages remain, the feed is only complete down to
 * the oldest fully-loaded transaction. An auxiliary event older than that would
 * render *below* history not yet fetched — a v1 registration sitting under a gap
 * where unloaded v2 rows belong — so it is withheld until paging reaches past it.
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

  return [
    ...paged,
    ...dropPagedDuplicates(auxiliaryEvents, pagedEvents).filter(
      (event) => event.timestamp >= horizon,
    ),
  ].sort((a, b) => b.timestamp - a.timestamp)
}
