import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { getRecentActivityTimelineQueryOptions } from '../hooks/useRecentActivityTimeline'

/**
 * The homepage's Recent Activity: the same nested timeline rows as the History
 * page, driven by the protocol-wide event feed instead of one name's.
 *
 * `includeSubjectName` because every row here concerns a different name. The
 * date / event chips are hidden: this is a homepage preview of a feed that is
 * never complete, so filtering within the window would narrow an arbitrary
 * slice rather than the activity someone was looking for.
 */
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
      events={data?.events ?? []}
      hasMore={data?.hasMore}
      includeSubjectName
      showFilters={false}
      heading={<h2 className="text-caps text-foreground">Recent Activity</h2>}
      emptyTitle="No recent activity"
      emptyDescription="Events will appear here as they happen."
    />
  )
}
