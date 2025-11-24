import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingMessage } from '@/components/molecules/LoadingMessage'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { RecordEdit } from '@/components/views/records/RecordEdit'
import { RecordList } from '@/components/views/records/RecordList'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/records')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(params.name))
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { view: 'list' | 'edit' } => {
    if (search.view === 'edit') return { view: 'edit' }
    else return { view: 'list' }
  },
})

const RecordView = ({
  view,
  name,
  records,
}: {
  view: 'list' | 'edit'
  name: string
  records: GetRecordsReturnType
}) => {
  switch (view) {
    case 'edit':
      return <RecordEdit />
    default:
      return <RecordList {...{ name, view }} records={records} />
  }
}

function App() {
  const { name } = Route.useParams()
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  const { view } = Route.useSearch()

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

  return <RecordView {...{ view, name }} records={data.records} />
}
