import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronDown, ChevronUp, ListFilter } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { Hex } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { buildEventTypeGroups, filterActions } from '../filterTimeline'
import {
  getNameHistoryTimelineQueryOptions,
  type TimelineIndexerEvent,
} from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionTimeline, TimelineFrame } from './ActionTimeline'

/**
 * Narrow the feed to a facet of the name's history.
 *
 * Scoping reuses the event-type filter: an action shows when its transaction
 * touched one of the scoped types, and its other events stay in the detail view
 * so the row still describes the whole transaction. The Event chip narrows
 * *within* the scope, so its options come from the scoped events rather than
 * every type the name has ever emitted.
 */
const applyScope = (
  events: readonly TimelineIndexerEvent[] | undefined,
  scope: readonly string[] | undefined,
) => {
  const all = events ?? []
  return {
    actions: filterActions(summarizeEvents(all), {}, scope ?? []),
    eventTypeGroups: buildEventTypeGroups(
      scope ? all.filter((event) => scope.includes(event.type)) : all,
    ),
  }
}

interface HistoryTimelineProps {
  readonly name: string
  /**
   * Restrict the timeline to transactions containing at least one of these
   * event types — how the per-facet views (address resolution, ownership, …)
   * show their slice of the name's history. Omit for the full feed.
   */
  readonly scope?: readonly string[]
  /** Left side of the header bar; defaults to the page-level "History" title. */
  readonly heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  readonly action?: ReactNode
  readonly emptyTitle?: string
  readonly emptyDescription?: string
}

/**
 * The History timeline: fetches the widened event feed, summarizes raw events into
 * semantic actions, and renders the three-tier nested timeline with date / event-type
 * filters and an expand-all toggle.
 *
 * Every view runs the same per-name query, so a facet view is a cache hit off
 * whatever the Overview or History page already fetched; `scope` narrows the
 * summarized actions client-side rather than refetching a filtered feed.
 */
export const HistoryTimeline = ({
  name,
  scope,
  heading,
  action,
  emptyTitle = 'No history yet',
  emptyDescription = "This name doesn't have any recorded history. Activity will appear here once transactions are made.",
}: HistoryTimelineProps) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryTimelineQueryOptions({ name, eventTypes: scope }),
  )
  const events = data?.events

  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  const { actions, eventTypeGroups } = applyScope(events, scope)
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
      <div className="flex w-full min-w-0 flex-col gap-4">
        {heading != null && (
          <div className="flex min-h-7 items-center justify-between gap-4">
            {heading}
            {action}
          </div>
        )}
        <NoResultsMessage
          title={emptyTitle}
          description={emptyDescription}
          className="mx-0 my-0"
        />
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {heading ?? <h1 className="text-4xl">History</h1>}
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
          {action}
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <NoResultsMessage
          title="No matching history"
          description="No events match the selected filters. Try widening the date range or clearing the event filter."
        />
      ) : (
        <TimelineFrame>
          {!scope && data?.hasMore && events && (
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
