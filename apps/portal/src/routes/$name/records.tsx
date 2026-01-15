import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { RecordList } from '@/components/views/records/RecordList'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/records')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(params.name))
  },
})

function App() {
  const { name } = Route.useParams()
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  if (isLoading) return <LoadingMessage />

  if (error) {
    const message =
      (error.cause as Error | undefined)?.message ||
      (error as Error).message ||
      'Could not load records.'
    return <ErrorMessage title="Records unavailable" description={message} />
  }

  if (!data) {
    return (
      <ErrorMessage
        title="Records unavailable"
        description="Could not load records."
      />
    )
  }

  return <RecordList {...{ name }} records={data.records} />
}
