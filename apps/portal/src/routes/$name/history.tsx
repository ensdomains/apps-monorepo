import { createFileRoute } from '@tanstack/react-router'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { getNameHistoryPagesQueryOptions } from '@/features/history/hooks/useNameHistoryTimeline'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchInfiniteQuery(
      getNameHistoryPagesQueryOptions({ name: params.name }),
    ),
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <HistoryTimeline name={name} />
}
