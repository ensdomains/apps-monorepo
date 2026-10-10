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
      // The same scope `HistoryTimeline` reads first: the full history, with
      // the children's registrations, no chip or date narrowing.
      getNameHistoryPagesQueryOptions({
        name: params.name,
        includeChildRegistrations: true,
      }),
    ),
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <HistoryTimeline name={name} />
}
