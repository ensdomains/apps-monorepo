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
import { buildEventTypeGroups, dateRangeToTimestamps } from '../filterTimeline'
import type { HistoryTimelineModel } from '../hooks/useHistoryTimeline'
import { useNameHistoryTimeline } from '../hooks/useHistoryTimeline'
import type { TimelineEventType } from '../summarize/descriptors'
import { HISTORY_TIMELINE_PAGE_SIZE } from '../timelineEventPage'
import { ActionTimeline } from './ActionTimeline'
import { TimelineBreak, TimelineLoadMore } from './TimelineBreak'

interface HistoryTimelineViewProps {
  readonly model: HistoryTimelineModel
  /**
   * What fills the break above the anchor row. `'load-more'` fetches the next
   * page in place (the History page); a node links out instead (the Overview's
   * "See full History"). Omitted where there is nothing to reach.
   */
  readonly breakContent?: 'load-more' | ReactNode
  /**
   * Left side of the header bar. Optional because this view is feed-agnostic
   * and has no subject to title itself with — `HistoryTimeline` supplies the
   * page-level "History" title for a name.
   */
  readonly heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  readonly action?: ReactNode
  /** The date / event-type chips, when the surface owns filter state. */
  readonly filters?: ReactNode
  readonly emptyTitle?: string
  readonly emptyDescription?: string
}

/**
 * The History timeline UI: the loaded action rows, a break where history
 * continues off screen, and the feed's first action pinned below it.
 *
 * Presentational — it owns only the expand-all toggle, so any feed can drive it
 * (a name's history, a registry contract's, the protocol-wide homepage one).
 * Everything that needs the query — paging, filters, the anchor — arrives on
 * `model`.
 */
export const HistoryTimelineView = ({
  model,
  breakContent,
  heading,
  action,
  filters,
  emptyTitle = 'No history yet',
  emptyDescription = "This name doesn't have any recorded history. Activity will appear here once transactions are made.",
}: HistoryTimelineViewProps) => {
  const {
    actions,
    anchorAction,
    hasMore,
    loadMore,
    isLoadingMore,
    totalCount,
    openIds,
    toggleAction,
    setAllOpen,
    isV1Truncated,
  } = model

  const allExpanded =
    actions.length > 0 && actions.every((a) => openIds.has(a.txHash))

  const toggleExpandAll = () =>
    setAllOpen(allExpanded ? [] : actions.map((a) => a.txHash))

  // Rendered when there are rows too, not only when a slot is filled: "Expand
  // all" is a control of the list, and a surface can supply no heading at all.
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

  if (actions.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        {header}
        <NoResultsMessage
          title={emptyTitle}
          description={emptyDescription}
          className="mx-0 my-0"
        />
      </div>
    )
  }

  // Pin the anchor only when there is hidden history to pin it below, and it
  // isn't already one of the rows above.
  const pinnedAction = match({ hasMore, anchorAction })
    .with({ hasMore: true, anchorAction: P.nonNullable }, ({ anchorAction }) =>
      actions.some((shown) => shown.txHash === anchorAction.txHash)
        ? undefined
        : anchorAction,
    )
    .otherwise(() => undefined)
  const showBreak = hasMore && breakContent != null

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
      {header}

      <TimelineFrame>
        <ActionTimeline
          actions={actions}
          openIds={openIds}
          onToggle={toggleAction}
          connectBelow={showBreak && 'dashed'}
        />
        {showBreak &&
          (breakContent === 'load-more' ? (
            <TimelineLoadMore
              pageSize={HISTORY_TIMELINE_PAGE_SIZE}
              totalCount={totalCount}
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
            />
          ) : (
            <TimelineBreak>{breakContent}</TimelineBreak>
          ))}
        {pinnedAction && (
          <ActionTimeline
            actions={[pinnedAction]}
            openIds={openIds}
            onToggle={toggleAction}
            connectAbove="dashed"
          />
        )}
      </TimelineFrame>

      {isV1Truncated && (
        <p className="text-muted-foreground text-p">
          This name has more ENSv1 history than can be read in one request; the
          oldest of it is not shown.
        </p>
      )}
    </div>
  )
}

interface HistoryTimelineProps
  extends Omit<HistoryTimelineViewProps, 'model' | 'filters' | 'breakContent'> {
  readonly name: string
  /**
   * Restrict the timeline to these event types — how the per-facet views
   * (address resolution, ownership, …) show their slice of the name's history.
   * Omit for the full feed.
   */
  readonly scope?: readonly TimelineEventType[]
  /** Show the date / event-type chips. */
  readonly showFilters?: boolean
  /**
   * Offer "Load more" in place. On by default: every surface this drives reads
   * a *page*, so without it a scoped facet would cap silently at the page size
   * with nothing on screen saying so. The Overview opts out via
   * `RecentHistoryTimeline`, which links to the History page instead.
   */
  readonly canLoadMore?: boolean
}

/**
 * A name's History timeline.
 *
 * Owns the filter state because the filters are part of the *query*, not a pass
 * over loaded rows: they go into the connection's `where`, so `totalCount` and
 * every page after them describe the filtered feed. Changing one is a new query
 * key, which resets paging for free.
 */
export const HistoryTimeline = ({
  name,
  scope,
  heading,
  showFilters = true,
  canLoadMore = true,
  ...viewProps
}: HistoryTimelineProps) => {
  const [dateRange, setDateRange] = useState<DateRange>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const model = useNameHistoryTimeline({
    name,
    scope,
    selectedTypes,
    ...dateRangeToTimestamps(dateRange),
    withAnchor: canLoadMore,
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
                onChange={setSelectedTypes}
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
