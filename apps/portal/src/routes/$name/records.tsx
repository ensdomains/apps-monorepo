import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { RecordList } from '@/features/records/components/RecordList'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
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
    return (
      <ErrorMessage
        title="Records unavailable"
        description={extractErrorMessage(error, 'Could not load records.')}
      />
    )
  }

  if (!data) {
    return (
      <NoResultsMessage
        title="No records yet"
        description="This name doesn't have any records set. Records will appear here once they're configured."
      />
    )
  }

  return <RecordList {...{ name }} records={data.records} />
}
