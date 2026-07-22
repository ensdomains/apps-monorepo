import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDownIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import { Timeline } from '@/components/ui/timeline'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { buildEventTypeGroups, filterActions } from '../filterTimeline'
import { formatTimelineDate } from '../formatTimelineDate'
import { getNameHistoryTimelineQueryOptions } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionSummaryRow } from './ActionSummaryRow'
import { RAIL_X } from './timelineGeometry'

interface HistoryTimelineProps {
  readonly name: string
}

/**
 * The History timeline: fetches the widened event feed, summarizes raw events into
 * semantic actions, and renders the three-tier nested timeline with date / event-type
 * filters and an expand-all toggle.
 */
export const HistoryTimeline = ({ name }: HistoryTimelineProps) => {
  const {
    data: events,
    isLoading,
    error,
  } = useQuery(getNameHistoryTimelineQueryOptions({ name }))

  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())

  const actions = useMemo(
    () => (events ? summarizeEvents(events) : []),
    [events],
  )
  const eventTypeGroups = useMemo(
    () => buildEventTypeGroups(events ?? []),
    [events],
  )
  const filteredActions = useMemo(
    () => filterActions(actions, dateRange, selectedTypes),
    [actions, dateRange, selectedTypes],
  )

  const allExpanded =
    filteredActions.length > 0 &&
    filteredActions.every((action) => openIds.has(action.id))

  const toggleAction = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleExpandAll = () =>
    setOpenIds(
      allExpanded ? new Set() : new Set(filteredActions.map((a) => a.id)),
    )

  if (isLoading) return <LoadingMessage />

  if (error) {
    return (
      <ErrorMessage
        title="Error loading history"
        description={error.cause?.message}
      />
    )
  }

  if (actions.length === 0) {
    return (
      <NoResultsMessage
        title="No history yet"
        description="This name doesn't have any recorded history. Activity will appear here once transactions are made."
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-heading">History</h1>
        <div className="flex items-center gap-2">
          <TableDateRangeFilter
            label="Date range"
            dateRange={dateRange}
            onChange={setDateRange}
            size="xs"
          />
          {eventTypeGroups.length > 0 && (
            <TableMultiSelectFilter
              label="Event"
              groups={eventTypeGroups}
              selectedValues={selectedTypes}
              onChange={setSelectedTypes}
              size="xs"
            />
          )}
          <Button variant="outline" onClick={toggleExpandAll} size="xs">
            <ChevronsUpDownIcon className="size-4" />
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <NoResultsMessage
          title="No matching history"
          description="No events match the selected filters. Try widening the date range or clearing the event filter."
        />
      ) : (
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-border"
            style={{ left: `${RAIL_X}px` }}
          />
          <Timeline>
            {filteredActions.map((action, index) => (
              <ActionSummaryRow
                key={action.id}
                action={action}
                isOpen={openIds.has(action.id)}
                onToggle={() => toggleAction(action.id)}
                showDate={
                  index === 0 ||
                  formatTimelineDate(filteredActions[index - 1].timestamp) !==
                    formatTimelineDate(action.timestamp)
                }
              />
            ))}
          </Timeline>
        </div>
      )}
    </div>
  )
}
