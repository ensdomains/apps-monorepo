import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import { useState } from 'react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { getNameHistoryTimelineQueryOptions } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionTimeline, TimelineFrame } from './ActionTimeline'

/** How many of the newest actions the Overview preview shows. */
const RECENT_ACTION_LIMIT = 4

interface RecentHistoryTimelineProps {
  readonly name: string
}

const RecentHistoryShell = ({
  name,
  children,
}: {
  readonly name: string
  readonly children: React.ReactNode
}) => (
  <div className="flex w-full min-w-0 flex-col gap-4">
    <div className="flex min-h-7 items-center justify-between gap-4">
      <h2 className="text-foreground text-h2">Recent History</h2>
      <Button variant="outline" size="xs" asChild>
        <Link to="/$name/history" params={{ name }}>
          <Clock className="size-4" />
          Full history
        </Link>
      </Button>
    </div>
    {children}
  </div>
)

/**
 * The Overview page's history preview: the same nested timeline rows as the
 * full History page, trimmed to the newest few actions with the oldest one
 * (usually the registration) pinned below a "see full history" gap.
 *
 * It runs the *same* query as `HistoryTimeline`, so opening Full history is a
 * cache hit rather than a second round trip.
 */
export const RecentHistoryTimeline = ({ name }: RecentHistoryTimelineProps) => {
  const {
    data: events,
    isLoading,
    error,
  } = useQuery(getNameHistoryTimelineQueryOptions({ name }))

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())

  const toggleAction = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (isLoading) return <LoadingMessage />

  if (error) {
    return (
      <RecentHistoryShell name={name}>
        <ErrorMessage
          compact
          description="Error fetching history. Please refresh the page."
        />
      </RecentHistoryShell>
    )
  }

  const actions = events ? summarizeEvents(events) : []

  if (actions.length === 0) {
    return (
      <RecentHistoryShell name={name}>
        <NoResultsMessage
          title="No recent activity"
          description="Events will appear here as they happen."
          className="mx-0 my-0"
        />
      </RecentHistoryShell>
    )
  }

  // Only worth splitting when at least one action would be hidden between the
  // recent run and the oldest row; otherwise the whole list fits.
  const hasHiddenActions = actions.length > RECENT_ACTION_LIMIT + 1
  const recent = hasHiddenActions
    ? actions.slice(0, RECENT_ACTION_LIMIT)
    : actions
  const oldest = hasHiddenActions ? actions[actions.length - 1] : undefined

  return (
    <RecentHistoryShell name={name}>
      <TimelineFrame>
        <ActionTimeline
          actions={recent}
          openIds={openIds}
          onToggle={toggleAction}
          connectBelow={hasHiddenActions}
        />
        {oldest && (
          <>
            <HiddenActionsGap name={name} eventCount={events?.length ?? 0} />
            <ActionTimeline
              actions={[oldest]}
              openIds={openIds}
              onToggle={toggleAction}
              connectAbove
            />
          </>
        )}
      </TimelineFrame>
    </RecentHistoryShell>
  )
}

/**
 * The break between the newest actions and the oldest one. The rail goes dashed
 * across it to show the timeline is not continuous here.
 */
const HiddenActionsGap = ({
  name,
  eventCount,
}: {
  readonly name: string
  readonly eventCount: number
}) => (
  <div className="relative py-2">
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-(--rail-x) w-0 border-neutral-2 border-l-2 border-dashed"
    />
    <div className="pl-(--detail-indent) text-muted-foreground text-p">
      See{' '}
      <Link
        to="/$name/history"
        params={{ name }}
        className="underline [text-underline-position:from-font] hover:text-foreground"
      >
        full History
      </Link>
      {eventCount > 0 && ` (${eventCount} events)`}
    </div>
  </div>
)
