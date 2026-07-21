import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
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
        title="History unavailable"
        description={error.cause?.message}
      />
    )

  const events = resolver?.events ?? []

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h2 md:text-h1">
        {events.length} Event{events.length !== 1 ? 's' : ''}
      </h1>

      <ResolverEventsTable events={events} enableSidebar />
    </div>
  )
}
