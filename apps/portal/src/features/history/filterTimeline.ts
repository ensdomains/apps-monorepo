import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { dateToPlainDate } from '@/utils/temporal'
import { HISTORY_EVENT_TYPE_LABELS } from './eventTypes'
import { type EventType, HISTORY_EVENT_TYPES } from './timelineEvent'

const plainDateToUnixSecondsUtc = (date: Temporal.PlainDate): number =>
  Math.floor(date.toZonedDateTime({ timeZone: 'UTC' }).epochMilliseconds / 1000)

/**
 * The Date range chip as inclusive `timestamp_gte` / `timestamp_lte` bounds.
 *
 * Anchored in UTC because events are dated by their UTC calendar day everywhere
 * else (`unixSecondsToPlainDateUtc`); reading the picker `Date`'s own instant
 * would cut a day short for anyone west of UTC.
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
 * The Event chip's options. Takes the surface's types rather than the loaded
 * events: deriving them from the rendered feed made the list collapse to
 * whatever was selected. bigname's vocabulary is closed, so the options are
 * known up front, in its canonical order.
 */
export const buildEventTypeGroups = (
  eventTypes: readonly EventType[],
): FilterGroup[] => {
  const present = new Set(eventTypes)
  const types = HISTORY_EVENT_TYPES.filter((type) => present.has(type))
  if (types.length === 0) return []
  return [
    {
      title: 'Event type',
      options: types.map((type) => ({
        label: HISTORY_EVENT_TYPE_LABELS[type],
        value: type,
      })),
    },
  ]
}
