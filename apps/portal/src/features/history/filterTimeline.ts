import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'
import { humanizeType } from './summarize/descriptors'
import type { Action } from './summarize/summarize.types'
import { IGNORED_TYPES } from './summarize/summarizeEvents'

const isWithinRange = (unixSeconds: number, range: DateRange): boolean => {
  if (!range.from && !range.to) return true
  const ms = unixSeconds * 1000
  if (range.from) {
    const from = new Date(range.from)
    from.setHours(0, 0, 0, 0)
    if (ms < from.getTime()) return false
  }
  if (range.to) {
    const to = new Date(range.to)
    to.setHours(23, 59, 59, 999)
    if (ms > to.getTime()) return false
  }
  return true
}

/** Filter actions by date range and by the event types they contain. */
export const filterActions = (
  actions: readonly Action[],
  dateRange: DateRange,
  selectedTypes: readonly string[],
): Action[] =>
  actions.filter(
    (action) =>
      isWithinRange(action.timestamp, dateRange) &&
      (selectedTypes.length === 0 ||
        action.events.some((event) => selectedTypes.includes(event.type))),
  )

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
