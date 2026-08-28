import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { dateToPlainDate } from '@/utils/temporal'
import { humanizeType } from './summarize/descriptors'
import { IGNORED_TYPES } from './summarize/summarizeEvents'

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
 * `to` covers the whole of its day: one second short of the next day's
 * midnight, reached with Temporal's own day arithmetic rather than by adding a
 * literal 86,400.
 */
export const dateRangeToTimestamps = (
  range: DateRange,
): { readonly from?: number; readonly to?: number } => ({
  ...(range.from && {
    from: plainDateToUnixSecondsUtc(dateToPlainDate(range.from)),
  }),
  ...(range.to && {
    to:
      plainDateToUnixSecondsUtc(dateToPlainDate(range.to).add({ days: 1 })) - 1,
  }),
})

/**
 * Build the "Event" multi-select options from the types a name actually has.
 *
 * Takes the types rather than events because they must come from a read that
 * does *not* carry the user's current selection — see
 * `getNameEventTypesQueryOptions`. Deriving them from the rendered feed is what
 * made the list collapse to the selected item.
 */
export const buildEventTypeGroups = (
  eventTypes: readonly string[],
): FilterGroup[] => {
  const types = [...new Set(eventTypes)]
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
