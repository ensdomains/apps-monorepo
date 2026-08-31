import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Button } from '@/components/ui/button'
import { useNameHistoryTimeline } from '../hooks/useHistoryTimeline'
import { HistoryTimelineView } from './HistoryTimeline'
import { timelineBreakActionClassName } from './TimelineBreak'

/** How many of the newest actions the Overview preview shows. */
const RECENT_ACTION_LIMIT = 4

interface RecentHistoryTimelineProps {
  readonly name: string
}

/**
 * The Overview preview: the shared timeline trimmed to the newest few actions,
 * whose break links out rather than loading in place (Figma `2075:16136`).
 */
export const RecentHistoryTimeline = ({ name }: RecentHistoryTimelineProps) => {
  const model = useNameHistoryTimeline({ name, limit: RECENT_ACTION_LIMIT })

  const heading = (
    <h2 className="text-foreground text-heading">Recent History</h2>
  )
  const action = (
    <Button variant="outline" size="xs" asChild>
      <Link to="/$name/history" params={{ name }}>
        <History className="size-4" />
        Full history
      </Link>
    </Button>
  )

  if (model.isLoading) return <LoadingMessage />

  if (model.error) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-7 items-center justify-between gap-4">
          {heading}
          {action}
        </div>
        <ErrorMessage
          compact
          description="Error fetching history. Please refresh the page."
        />
      </div>
    )
  }

  return (
    <HistoryTimelineView
      model={model}
      heading={heading}
      action={action}
      breakContent={
        <>
          See{' '}
          <Link
            to="/$name/history"
            params={{ name }}
            className={timelineBreakActionClassName}
          >
            full History
          </Link>
          {model.totalCount !== undefined && ` (${model.totalCount} events)`}
        </>
      }
      emptyTitle="No recent activity"
      emptyDescription="Events will appear here as they happen."
    />
  )
}
