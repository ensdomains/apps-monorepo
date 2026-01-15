import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { HistoryDataTable } from '@/components/views/history/HistoryDataTable'
import { getNameHistoryQueryOptions } from '@/features/profile/hooks/useNameHistory'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getNameHistoryQueryOptions({ name: params.name }),
    )
  },
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { data, isLoading, error } = useQuery(
    getNameHistoryQueryOptions({ name }),
  )

  if (isLoading) return <LoadingMessage />

  if (error) {
    const message =
      (error.cause as Error | undefined)?.message ||
      (error as Error).message ||
      'Could not load history.'
    return <ErrorMessage title="Error loading history" description={message} />
  }

  if (!data) {
    return (
      <ErrorMessage
        title="History unavailable"
        description="Could not load history."
      />
    )
  }

  return <HistoryDataTable name={name} history={data} />
}
