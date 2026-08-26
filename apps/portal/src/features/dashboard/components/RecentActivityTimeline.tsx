import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { getRecentActivityTimelineQueryOptions } from '../hooks/useRecentActivityTimeline'

/** The homepage's Recent Activity — the History timeline over the global feed. */
export const RecentActivityTimeline = () => {
  const { data, isLoading, error } = useQuery(
    getRecentActivityTimelineQueryOptions(),
  )

  if (isLoading) return <LoadingMessage />

  if (error) {
    return (
      <ErrorMessage
        title="Error loading recent activity"
        description={error.cause?.message}
      />
    )
  }

  return (
    <HistoryTimelineView
      events={data ?? []}
      includeSubjectName
      showFilters={false}
      heading={<h2 className="text-caps text-foreground">Recent Activity</h2>}
      emptyTitle="No recent activity"
      emptyDescription="Events will appear here as they happen."
    />
  )
}
