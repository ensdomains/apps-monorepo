import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { useTimelinePagesModel } from '@/features/history/hooks/useHistoryTimeline'
import {
  fetchResolverEventsPage,
  timelinePageParams,
} from '@/features/history/timelineEventPage'
import { resolverHistoryTimelineQueryKey } from '@/features/resolver/hooks/useResolverOverview'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

export const Route = createFileRoute('/resolver/$address/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

/** The resolver's feed, the same one its overview previews, a page at a time. */
function RouteComponent() {
  const { address } = Route.useParams()
  const model = useTimelinePagesModel(
    resultInfiniteQueryOptions({
      queryKey: resolverHistoryTimelineQueryKey({ address }),
      queryFn: ({ queryKey: [, { address }], pageParam }) =>
        fetchResolverEventsPage({
          resolverAddress: address,
          cursor: pageParam,
        }),
      ...timelinePageParams,
    }),
  )

  if (model.isLoading) return <LoadingMessage />
  if (model.error) {
    return (
      <ErrorMessage
        title="Error loading resolver history"
        description={extractErrorMessage(model.error, '')}
      />
    )
  }

  return (
    <HistoryTimelineView
      model={model}
      breakContent="load-more"
      heading={
        <PageHeading parent={{ type: 'resolver', address }}>
          History
        </PageHeading>
      }
      showActor
      emptyTitle="No events yet"
      emptyDescription="Events for this resolver will appear here."
    />
  )
}
