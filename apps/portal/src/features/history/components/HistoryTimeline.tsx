import { Calendar, ChevronDown, ChevronUp, ListFilter } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { match, P } from 'ts-pattern'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { PageHeading } from '@/components/PageHeading'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import { TimelineFrame } from '@/components/ui/timeline'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { toHistoryEventTypes } from '../eventTypes'
import { buildEventTypeGroups, dateRangeToTimestamps } from '../filterTimeline'
import type { HistoryTimelineModel } from '../hooks/useHistoryTimeline'
import {
  TIMELINE_WINDOW_SIZE,
  useNameHistoryTimeline,
} from '../hooks/useHistoryTimeline'
import type { EventType, TimelineEvent } from '../timelineEvent'
import { ActionTimeline } from './ActionTimeline'
import { TimelineBreak, TimelineLoadMore } from './TimelineBreak'

interface HistoryTimelineViewProps {
  readonly model: HistoryTimelineModel
  readonly breakContent?: 'load-more' | ReactNode
  readonly heading?: ReactNode
  readonly action?: ReactNode
  readonly filters?: ReactNode
  /** Lead each row with the transaction sender — see `ActionSummaryRow`. */
  readonly showActor?: boolean
  readonly emptyTitle?: string
  readonly emptyDescription?: string
}

/**
 * The loaded rows, a break where history continues off screen, and the feed's
 * first action pinned below it. Presentational — everything that needs the query
 * arrives on `model`.
 */
export const HistoryTimelineView = ({
  model,
  breakContent,
  heading,
  action,
  filters,
  showActor = false,
  emptyTitle = 'No history yet',
  emptyDescription = "This name doesn't have any recorded history. Activity will appear here once transactions are made.",
}: HistoryTimelineViewProps) => {
  const {
    actions,
    anchorAction,
    hasMore,
    loadMore,
    isLoadingMore,
    isLoadMoreError,
    totalCount,
    openIds,
    toggleAction,
    setAllOpen,
    sourcesError,
  } = model

  const allExpanded =
    actions.length > 0 && actions.every((a) => openIds.has(a.id))

  const toggleExpandAll = () =>
    setAllOpen(allExpanded ? [] : actions.map((a) => a.id))

  // Rendered when there are rows too: "Expand all" is a control of the list.
  const header = (heading != null ||
    action != null ||
    filters != null ||
    actions.length > 0) && (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {heading}
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        {actions.length > 0 && (
          <Button variant="outline" onClick={toggleExpandAll} size="xs">
            {allExpanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        )}
        {action}
      </div>
    </div>
  )

  const showBreak = hasMore && breakContent != null

  const breakRow =
    breakContent === 'load-more' ? (
      <TimelineLoadMore
        totalCount={totalCount}
        isLoading={isLoadingMore}
        isError={isLoadMoreError}
        onLoadMore={loadMore}
      />
    ) : (
      <TimelineBreak>{breakContent}</TimelineBreak>
    )

  // Rendered by both branches: a failed source with nothing to show is exactly
  // when "No history yet" would otherwise pass unavailable history off as none.
  const disclosures = sourcesError && (
    <ErrorMessage
      compact
      description="Couldn't load this name's first event, so it may be missing below."
    />
  )

  // Still offer the break with no rows: a page whose boundary trim empties it
  // would otherwise dead-end on "No history yet" with more to come and nothing
  // to click.
  if (actions.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        {header}
        <NoResultsMessage
          title={emptyTitle}
          description={emptyDescription}
          className="mx-0 my-0"
        />
        {showBreak && <TimelineFrame>{breakRow}</TimelineFrame>}
        {disclosures}
      </div>
    )
  }

  // Only when there is hidden history below it, and it isn't already a row above.
  const pinnedAction = match({ hasMore, anchorAction })
    .with({ hasMore: true, anchorAction: P.nonNullable }, ({ anchorAction }) =>
      actions.some((shown) => shown.id === anchorAction.id)
        ? undefined
        : anchorAction,
    )
    .otherwise(() => undefined)
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
      {header}

      <TimelineFrame>
        <ActionTimeline
          actions={actions}
          openIds={openIds}
          onToggle={toggleAction}
          showActor={showActor}
          connectBelow={showBreak && 'dashed'}
        />
        {showBreak && breakRow}
        {pinnedAction && (
          <ActionTimeline
            actions={[pinnedAction]}
            openIds={openIds}
            onToggle={toggleAction}
            showActor={showActor}
            connectAbove="dashed"
          />
        )}
      </TimelineFrame>

      {disclosures}
    </div>
  )
}

interface HistoryTimelineProps
  extends Omit<HistoryTimelineViewProps, 'model' | 'filters' | 'breakContent'> {
  readonly name: string
  /** What the surface may ever show, as bigname types. */
  readonly scope?: readonly EventType[]
  /**
   * Narrows loaded rows within `scope` where bigname has no query filter (e.g.
   * one record family). Totals are hidden while it is set.
   */
  readonly eventFilter?: (event: TimelineEvent) => boolean
  readonly showFilters?: boolean
  readonly canLoadMore?: boolean
}

/**
 * Owns the filter state because filters are part of the *query*, not a pass over
 * loaded rows. Changing one is a new query key, which resets paging for free.
 */
export const HistoryTimeline = ({
  name,
  scope,
  eventFilter,
  heading,
  showFilters = true,
  canLoadMore = true,
  ...viewProps
}: HistoryTimelineProps) => {
  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>([])

  const model = useNameHistoryTimeline({
    name,
    scope,
    eventFilter,
    selectedTypes,
    ...dateRangeToTimestamps(dateRange),
    windowSize: canLoadMore ? TIMELINE_WINDOW_SIZE : undefined,
    shouldFetchAnchor: canLoadMore,
  })

  if (model.isLoading) return <LoadingMessage />

  if (model.error) {
    return (
      <ErrorMessage
        title="Error loading history"
        description={extractErrorMessage(model.error, '')}
      />
    )
  }

  const eventTypeGroups = buildEventTypeGroups(model.eventTypes)

  return (
    <HistoryTimelineView
      model={model}
      breakContent={canLoadMore ? 'load-more' : undefined}
      heading={
        heading ?? (
          <PageHeading parent={{ type: 'name', name }}>History</PageHeading>
        )
      }
      filters={
        showFilters && (
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
                onChange={(values) =>
                  setSelectedTypes([...(toHistoryEventTypes(values) ?? [])])
                }
                size="xs"
                icon={ListFilter}
                hideValue
              />
            )}
          </>
        )
      }
      {...viewProps}
      {...((selectedTypes.length > 0 || !!dateRange.from || !!dateRange.to) && {
        emptyTitle: 'No matching history',
        emptyDescription:
          'No events match the selected filters. Try widening the date range or clearing the event filter.',
      })}
    />
  )
}
