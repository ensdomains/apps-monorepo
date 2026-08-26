import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronDown, ChevronUp, ListFilter } from 'lucide-react'
import { useState } from 'react'
import type { Hex } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { buildEventTypeGroups, filterActions } from '../filterTimeline'
import { getNameHistoryTimelineQueryOptions } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionTimeline, TimelineFrame } from './ActionTimeline'

interface HistoryTimelineProps {
  readonly name: string
}

/**
 * The History timeline: fetches the widened event feed, summarizes raw events into
 * semantic actions, and renders the three-tier nested timeline with date / event-type
 * filters and an expand-all toggle.
 */
export const HistoryTimeline = ({ name }: HistoryTimelineProps) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryTimelineQueryOptions({ name }),
  )
  const events = data?.events

  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  const actions = events ? summarizeEvents(events) : []
  const eventTypeGroups = buildEventTypeGroups(events ?? [])
  const filteredActions = filterActions(actions, dateRange, selectedTypes)

  const allExpanded =
    filteredActions.length > 0 &&
    filteredActions.every((action) => openIds.has(action.txHash))

  const toggleAction = (id: Hex) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleExpandAll = () =>
    setOpenIds(
      allExpanded ? new Set() : new Set(filteredActions.map((a) => a.txHash)),
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
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-4xl">History</h1>
        <div className="flex flex-wrap items-center gap-2">
          <TableDateRangeFilter
            label="Date range"
            dateRange={dateRange}
            onChange={setDateRange}
            size="xs"
            icon={Calendar}
            hideValue
          />
          {eventTypeGroups.length > 0 && (
            <TableMultiSelectFilter
              label="Event"
              groups={eventTypeGroups}
              selectedValues={selectedTypes}
              onChange={setSelectedTypes}
              size="xs"
              icon={ListFilter}
              hideValue
            />
          )}
          <Button variant="outline" onClick={toggleExpandAll} size="xs">
            {allExpanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
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
        <TimelineFrame>
          {data?.hasMore && events && (
            <p className="mb-3 text-muted-foreground text-p">
              Showing the most recent {events.length} events.
            </p>
          )}
          <ActionTimeline
            actions={filteredActions}
            openIds={openIds}
            onToggle={toggleAction}
          />
        </TimelineFrame>
      )}
    </div>
  )
}
