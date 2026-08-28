import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { dateToPlainDate } from '@/utils/temporal'
import { humanizeType } from './summarize/descriptors'
import { IGNORED_TYPES } from './summarize/summarizeEvents'
import type { TimelineIndexerEvent } from './timelineEvent'

const SECONDS_PER_DAY = 86_400

const plainDateToUnixSecondsUtc = (date: Temporal.PlainDate): number =>
  Math.floor(date.toZonedDateTime({ timeZone: 'UTC' }).epochMilliseconds / 1000)

/**
 * The Date range chip as inclusive unix-second bounds for the query's
 * `timestamp_gte` / `timestamp_lte`.
 *
 * The picker hands back a `Date` standing for a calendar day, and events are
 * dated by their UTC calendar day everywhere else in the timeline
 * (`unixSecondsToPlainDateUtc`), so both ends are anchored in UTC. Reading the
 * `Date`'s own instant instead would shift the boundary by the viewer's offset
 * and cut a day short for anyone west of UTC.
 *
 * `to` covers the whole of its day: the last second of it, not its midnight.
 */
export const dateRangeToTimestamps = (
  range: DateRange,
): { readonly from?: number; readonly to?: number } => ({
  ...(range.from && {
    from: plainDateToUnixSecondsUtc(dateToPlainDate(range.from)),
  }),
  ...(range.to && {
    to:
      plainDateToUnixSecondsUtc(dateToPlainDate(range.to)) +
      SECONDS_PER_DAY -
      1,
  }),
})

/**
 * Build the "Event" multi-select options from the event types present in the
 * data.
 *
 * Derived from what has loaded rather than from the descriptor vocabulary, so
 * the list stays short and relevant — but that means loading another page can
 * add an option.
 * TODO(indexer): expose the distinct event types for a name so the chip can
 * offer the whole set up front.
 */
export const buildEventTypeGroups = (
  events: readonly TimelineIndexerEvent[],
): FilterGroup[] => {
  const types = [...new Set(events.map((event) => event.type))]
    .filter((type) => !IGNORED_TYPES.has(type))
    .sort()
  if (types.length === 0) return []
  return [
    {
      title: 'Event type',
      options: types.map((type) => ({
        label: humanizeType(type),
        value: type,
      })),
    },
  ]
}
