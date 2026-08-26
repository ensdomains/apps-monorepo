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
import { TimelineFrame } from '@/components/ui/timeline'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { buildEventTypeGroups, filterActions } from '../filterTimeline'
import {
  getNameHistoryTimelineQueryOptions,
  type TimelineIndexerEvent,
} from '../hooks/useNameHistoryTimeline'
import type { TimelineEventType } from '../summarize/descriptors'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionTimeline } from './ActionTimeline'

interface HistoryTimelineViewProps {
  /** The raw event feed; summarized into actions here, one row per transaction. */
  readonly events: readonly TimelineIndexerEvent[]
  /** Whether history exists beyond `events`, i.e. show the truncation note. */
  readonly hasMore?: boolean
  /** Whether `events` is one facet of a larger feed — wording of that note. */
  readonly isScoped?: boolean
  /** Left side of the header bar; defaults to the page-level "History" title. */
  readonly heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  readonly action?: ReactNode
  /** Show the date / event-type chips and the truncation note. */
  readonly showFilters?: boolean
  readonly emptyTitle?: string
  readonly emptyDescription?: string
  /**
   * Prefix rows with the name they concern. For feeds whose rows have
   * different subjects (a registry's labels) — see `summarizeEvents`.
   */
  readonly includeSubjectName?: boolean
}

/**
 * The History timeline UI: summarizes raw events into semantic actions and
 * renders the nested timeline with date / event-type filter chips and an
 * expand-all toggle.
 *
 * Presentational — it owns the filter and expansion state but does no
 * fetching, so any feed of `TimelineIndexerEvent`s can drive it (a name's
 * history via `HistoryTimeline`, a registry contract's via
 * `RegistryHistoryByAddress`).
 */
export const HistoryTimelineView = ({
  events,
  hasMore = false,
  isScoped = false,
  heading,
  action,
  showFilters = true,
  emptyTitle = 'No history yet',
  emptyDescription = "This name doesn't have any recorded history. Activity will appear here once transactions are made.",
  includeSubjectName = false,
}: HistoryTimelineViewProps) => {
  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  const actions = summarizeEvents(events, { includeSubjectName })
  const eventTypeGroups = buildEventTypeGroups(events)
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
          {showFilters && (
            <>
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
            </>
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
          {/* Counts the rows on screen, not the events behind them: a row is
              one transaction, so counting events would put a figure above the
              list that nothing in it adds up to.

              Tied to `showFilters` because both mark a standalone History view:
              there, the note is the only thing saying the window is capped (the
              indexer exposes no cursor to page past it). An embedded section
              hides both and discloses through its "Full history" link instead,
              the way the Overview's preview does. */}
          {showFilters && hasMore && (
            <p className="mb-3 text-muted-foreground text-p">
              Showing the most recent {filteredActions.length}
              {isScoped ? ' matching' : ''} transactions.
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

interface HistoryTimelineProps
  extends Omit<
    HistoryTimelineViewProps,
    'events' | 'hasMore' | 'isScoped' | 'includeSubjectName'
  > {
  readonly name: string
  /**
   * Restrict the timeline to these event types — how the per-facet views
   * (address resolution, ownership, …) show their slice of the name's history.
   * Omit for the full feed.
   */
  readonly scope?: readonly TimelineEventType[]
}

/**
 * A name's History timeline: fetches the widened event feed and hands it to
 * `HistoryTimelineView`.
 *
 * `scope` is pushed down into the query, so a facet view fetches only its own
 * event types — `first` bounds the whole feed, and a name with unrelated churn
 * would otherwise spend the window before its facet's events were reached.
 */
export const HistoryTimeline = ({
  name,
  scope,
  ...viewProps
}: HistoryTimelineProps) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryTimelineQueryOptions({ name, eventTypes: scope }),
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

  return (
    <HistoryTimelineView
      events={data?.events ?? []}
      hasMore={data?.hasMore}
      isScoped={scope != null}
      {...viewProps}
    />
  )
}
