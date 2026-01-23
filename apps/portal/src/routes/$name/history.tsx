import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { HistoryDataTable } from '@/features/history/components/HistoryDataTable'
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
      <NoResultsMessage
        title="No history yet"
        description="This name doesn't have any recorded history. Activity will appear here once transactions are made."
      />
    )
  }

  return <HistoryDataTable name={name} history={data} />
}
