import { useQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { HistoryDataTable } from '@/features/history/components/HistoryDataTable'
import { getNameHistoryQueryOptions } from '@/features/profile/hooks/useNameHistory'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return Promise.all([
      queryClient.prefetchQuery(
        getNameHistoryQueryOptions({ name: params.name }),
      ),
      queryClient.prefetchQuery(
        getV2NameHistoryQueryOptions({ name: params.name }),
      ),
    ])
  },
})

function RouteComponent() {
  const { name } = Route.useParams()

  const [v1Query, v2Query] = useQueries({
    queries: [
      getNameHistoryQueryOptions({ name }),
      getV2NameHistoryQueryOptions({ name }),
    ],
  })

  if (v1Query.isLoading || v2Query.isLoading) {
    return <LoadingMessage />
  }

  if (v1Query.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching history. Please refresh the page."
      />
    )
  }

  if (v2Query.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching history. Please refresh the page."
      />
    )
  }

  const hasV1Data =
    v1Query.data &&
    Object.values(v1Query.data).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    )
  const hasV2Data = v2Query.data && v2Query.data.length > 0

  if (!hasV1Data && !hasV2Data) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-h1">History</h1>
        <NoResultsMessage
          title="No history yet"
          description="This name doesn't have any recorded history. Activity will appear here once transactions are made."
          className="mx-0"
        />
      </div>
    )
  }

  return (
    <HistoryDataTable
      name={name}
      history={{
        v1History: v1Query.data,
        v2History: v2Query.data,
      }}
    />
  )
}
