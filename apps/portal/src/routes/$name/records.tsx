import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams, useSearch } from '@tanstack/react-router'
import { RecordEdit } from '@/components/views/records/RecordEdit'
import { RecordList } from '@/components/views/records/RecordList'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/records')({
  component: App,
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
  const { name } = useParams({ from: '/$name/records' })
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  const { view } = useSearch({ from: '/$name/records' })

  if (isLoading) return <div>Loading...</div>
  if (error || !data) {
    if (error) return <div>Error: {error.cause.message}</div>
    return <div>Could not load records</div>
  }

  return <RecordView {...{ view, name }} records={data.records} />
}
