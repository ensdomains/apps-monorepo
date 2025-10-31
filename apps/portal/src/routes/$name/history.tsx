import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HistoryList } from '@/components/views/history/HistoryList'
import { getNameHistoryQueryOptions } from '@/features/profile/hooks/useNameHistory'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/history')({
  component: RouteComponent,
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

  if (isLoading) return <div>Loading...</div>

  if (error || !data) {
    if (error) return <div>Error: {(error.cause as Error).message}</div>
    return <div>Could not load history</div>
  }

  return <HistoryList name={name} history={data} />
}
