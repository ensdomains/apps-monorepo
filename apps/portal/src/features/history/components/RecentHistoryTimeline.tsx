import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { useState } from 'react'
import type { Hex } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { Rail } from '@/components/ui/timeline'
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
  <div className="flex w-full min-w-0 flex-col gap-3">
    <div className="flex min-h-7 items-center justify-between gap-4">
      <h2 className="text-foreground text-heading">Recent History</h2>
      <Button variant="outline" size="xs" asChild>
        <Link to="/$name/history" params={{ name }}>
          <History className="size-4" />
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
 * Its windows are much smaller than the History page's, so the two do not share
 * a query key — opening Full history is a fresh fetch behind the rows already on
 * screen, not a cache hit.
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

  // Both windows gate the timeline: the oldest action decides whether the gap
  // renders at all, so drawing before it settles would show a complete-looking
  // history and then push a gap and another row in underneath it.
  if (recentQuery.isLoading || firstQuery.isLoading) return <LoadingMessage />

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

  const { totalCount, hasV1History } = recentQuery.data
  const recent = actions.slice(0, RECENT_ACTION_LIMIT)
  // Summarized actions come back newest-first, so the name's first action is
  // the last one of the ascending window.
  const firstAction = firstQuery.data
    ? summarizeEvents(firstQuery.data.events).at(-1)
    : undefined
  // Only pin it when it isn't already one of the rows above.
  const pinnedAction =
    firstAction &&
    !recent.some((action) => action.txHash === firstAction.txHash)
      ? firstAction
      : undefined
  // The break is drawn on evidence of hidden history, not on having something to
  // pin, so a failed oldest-action query still leaves the link out correct.
  // `totalCount` counts v2 events only, so that clause can only ever
  // under-report — `hasMore` is what covers a v1-only name, whose count is
  // always 0. Without it, a name whose recent window is full but summarizes to
  // no more than `RECENT_ACTION_LIMIT` actions would render as a complete
  // history once the oldest-action query failed.
  const hasHiddenActions =
    pinnedAction !== undefined ||
    actions.length > recent.length ||
    recentQuery.data.hasMore ||
    recentQuery.data.events.length < totalCount

  return (
    <RecentHistoryShell name={name}>
      <TimelineFrame>
        <ActionTimeline
          actions={recent}
          openIds={openIds}
          onToggle={toggleAction}
          connectBelow={hasHiddenActions && 'dashed'}
        />
        {hasHiddenActions && (
          <>
            <div className="relative py-3">
              <Rail className="inset-y-0" connection="dashed" />
              <div className="pl-(--label-x) text-neutral-7 text-p">
                See{' '}
                <Link
                  to="/$name/history"
                  params={{ name }}
                  className="underline [text-underline-position:from-font] hover:text-foreground"
                >
                  full History
                </Link>
                {/* The count is v2-only, so a name with any v1 history would
                    print a figure that omits all of it. */}
                {totalCount > 0 && !hasV1History && ` (${totalCount} events)`}
              </div>
            </div>
            {pinnedAction && (
              <ActionTimeline
                actions={[pinnedAction]}
                openIds={openIds}
                onToggle={toggleAction}
                connectAbove="dashed"
              />
            )}
            {!pinnedAction && firstQuery.error && (
              <ErrorMessage
                compact
                description="Couldn't load the start of this name's history."
              />
            )}
          </>
        )}
      </TimelineFrame>
    </RecentHistoryShell>
  )
}
