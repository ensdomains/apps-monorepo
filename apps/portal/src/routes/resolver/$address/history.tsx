import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { ResolverEventsTable } from '@/features/resolver/components/ResolverEventsTable'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({
        address: params.address as Address,
      }),
    )
  },
})

function RouteComponent() {
  const { address } = Route.useParams()

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching history. Please refresh the page."
      />
    )

  const events = resolver?.events ?? []
  // The overview loads the newest 200 events; the heading counts them all.
  const eventCount = resolver?.eventCount ?? events.length

  return (
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'resolver', address: address as Address }}>
        {eventCount > 0 ? `History (${eventCount})` : 'History'}
      </PageHeading>

      {events.length < eventCount && (
        <p className="text-sm text-muted-foreground">
          {`Showing the newest ${events.length.toLocaleString()} of ${eventCount.toLocaleString()} events.`}
        </p>
      )}

      {events.length > 0 ? (
        <ResolverEventsTable events={events} enableSidebar />
      ) : (
        <NoResultsMessage
          title="No events yet"
          description="Events for this resolver will appear here."
          className="mx-0"
        />
      )}
    </div>
  )
}
