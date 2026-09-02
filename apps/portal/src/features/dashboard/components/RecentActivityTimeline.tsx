import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { useTimelinePagesModel } from '@/features/history/hooks/useHistoryTimeline'
import { IGNORED_TYPES } from '@/features/history/summarize/summarizeEvents'
import {
  fetchTimelineEventPage,
  HISTORY_TIMELINE_PAGE_SIZE,
  timelinePageParams,
} from '@/features/history/timelineEventPage'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

const recentActivityTimelineQueryKey = createQueryKey(
  'get-recent-activity-timeline',
)

/**
 * The homepage's Recent Activity: the shared timeline over the protocol-wide
 * feed. No anchor — there is no first registration to pin — and the break loads
 * in place, since there is no per-subject History page to link to.
 */
export const RecentActivityTimeline = () => {
  const model = useTimelinePagesModel(
    resultInfiniteQueryOptions({
      queryKey: recentActivityTimelineQueryKey(),
      queryFn: ({ pageParam }) =>
        fetchTimelineEventPage({
          where: { type_not_in: [...IGNORED_TYPES] },
          first: HISTORY_TIMELINE_PAGE_SIZE,
          after: pageParam,
        }),
      ...timelinePageParams,
      // An infinite query refetches *every* loaded page in sequence, so a flat
      // interval costs N+1 requests every 30s after N "Load more" clicks. The
      // poll exists to bring new events in at the top; a reader who has paged
      // past the first page is no longer watching it, so it stops there.
      refetchInterval: (query) =>
        (query.state.data?.pages.length ?? 0) > 1 ? false : 30_000,
      staleTime: 15_000,
    }),
  )

  if (model.isLoading) return <LoadingMessage />

  if (model.error) {
    return (
      <ErrorMessage
        title="Error loading recent activity"
        description={extractErrorMessage(model.error, '')}
      />
    )
  }

  return (
    <HistoryTimelineView
      model={model}
      breakContent="load-more"
      heading={<h2 className="text-caps text-foreground">Recent Activity</h2>}
      emptyTitle="No recent activity"
      emptyDescription="Events will appear here as they happen."
    />
  )
}
