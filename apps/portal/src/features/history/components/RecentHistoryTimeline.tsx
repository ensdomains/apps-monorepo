import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import { useState } from 'react'
import type { Hex } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { getNameHistoryTimelineQueryOptions } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionTimeline, TimelineFrame } from './ActionTimeline'

/** How many of the newest actions the Overview preview shows. */
const RECENT_ACTION_LIMIT = 4

/**
 * Event window for the preview. `first` counts raw events and
 * `truncateToTransactions` trims on transaction boundaries, so this is a
 * comfortable over-fetch for `RECENT_ACTION_LIMIT` actions rather than an exact
 * figure — but far short of the History page's own window, which the Overview
 * has no use for.
 */
const RECENT_EVENT_WINDOW = 20

/**
 * Window for the oldest action pinned below the gap. It comes from a separate
 * ascending query because the bounded window above only reaches back a few
 * transactions — that row is meant to be where the name's history *starts*, not
 * whichever action happens to fall off the end of the preview.
 */
const FIRST_ACTION_WINDOW = 25

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
  const [recentQuery, firstQuery] = useQueries({
    queries: [
      getNameHistoryTimelineQueryOptions({ name, first: RECENT_EVENT_WINDOW }),
      getNameHistoryTimelineQueryOptions({
        name,
        first: FIRST_ACTION_WINDOW,
        orderDirection: 'asc',
      }),
    ],
  })

  const [openIds, setOpenIds] = useState<ReadonlySet<Hex>>(new Set())

  const toggleAction = (id: Hex) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (recentQuery.isLoading) return <LoadingMessage />

  if (recentQuery.error) {
    return (
      <RecentHistoryShell name={name}>
        <ErrorMessage
          compact
          description="Error fetching history. Please refresh the page."
        />
      </RecentHistoryShell>
    )
  }

  const actions = recentQuery.data
    ? summarizeEvents(recentQuery.data.events)
    : []

  if (!recentQuery.data || actions.length === 0) {
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

  const { totalCount } = recentQuery.data
  const recent = actions.slice(0, RECENT_ACTION_LIMIT)
  // Summarized actions come back newest-first, so the name's first action is
  // the last one of the ascending window.
  const firstAction = firstQuery.data
    ? summarizeEvents(firstQuery.data.events).at(-1)
    : undefined
  const hasHiddenActions =
    firstAction !== undefined &&
    !recent.some((action) => action.txHash === firstAction.txHash)

  return (
    <RecentHistoryShell name={name}>
      <TimelineFrame>
        <ActionTimeline
          actions={recent}
          openIds={openIds}
          onToggle={toggleAction}
          connectBelow={hasHiddenActions}
        />
        {hasHiddenActions && (
          <>
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
                {totalCount > 0 && ` (${totalCount} events)`}
              </div>
            </div>
            <ActionTimeline
              actions={[firstAction]}
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
