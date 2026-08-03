import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { dateToPlainDate, unixSecondsToPlainDateUtc } from '@/utils/temporal'
import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'
import { humanizeType } from './summarize/descriptors'
import type { Action } from './summarize/summarize.types'
import { IGNORED_TYPES, summarizeEvents } from './summarize/summarizeEvents'

const isWithinRange = (unixSeconds: number, range: DateRange): boolean => {
  if (!range.from && !range.to) return true
  const eventDate = unixSecondsToPlainDateUtc(unixSeconds)
  if (
    range.from &&
    Temporal.PlainDate.compare(eventDate, dateToPlainDate(range.from)) < 0
  ) {
    return false
  }
  if (
    range.to &&
    Temporal.PlainDate.compare(eventDate, dateToPlainDate(range.to)) > 0
  ) {
    return false
  }
  return true
}

/** Filter actions by date range and by the event types they contain. */
export const filterActions = (
  actions: readonly Action[],
  dateRange: DateRange,
  selectedTypes: readonly string[],
): Action[] => {
  const result: Action[] = []
  for (const action of actions) {
    if (!isWithinRange(action.timestamp, dateRange)) continue
    if (selectedTypes.length === 0) {
      result.push(action)
      continue
    }
    const events = action.events.filter((event) =>
      selectedTypes.includes(event.type),
    )
    if (events.length === 0) continue
    result.push(...summarizeEvents(events))
  }
  return result
}

/** Build the "Event" multi-select options from the event types present in the data. */
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
