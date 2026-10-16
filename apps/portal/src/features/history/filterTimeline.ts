import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { dateToPlainDate, plainDateToDate } from '@/utils/temporal'
import { humanizeType } from './summarize/descriptors'
import { IGNORED_TYPES } from './summarize/summarizeEvents'

const toUnixSeconds = (date: Temporal.PlainDate): number =>
  Math.floor(plainDateToDate(date).getTime() / 1000)

/** The Date range chip as inclusive `timestamp_gte` / `timestamp_lte` bounds, in local days. */
export const dateRangeToTimestamps = (
  range: DateRange,
): { readonly from?: number; readonly to?: number } => ({
  ...(range.from && {
    from: toUnixSeconds(dateToPlainDate(range.from)),
  }),
  ...(range.to && {
    to: toUnixSeconds(dateToPlainDate(range.to).add({ days: 1 })) - 1,
  }),
})

/**
 * Takes types rather than events because they must come from a read that does
 * *not* carry the current selection — deriving them from the rendered feed made
 * the list collapse to whatever was selected. See `getNameEventTypesQueryOptions`.
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
