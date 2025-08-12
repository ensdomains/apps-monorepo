import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { createFileRoute, useParams, useSearch } from '@tanstack/react-router'
import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { RecordEdit } from '@/components/views/records/RecordEdit'
import { RecordList } from '@/components/views/records/RecordList'
import {
  getProfileQueryOptions,
  useProfile,
} from '@/features/profile/hooks/useProfile'
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
  const { data, isLoading, error } = useProfile(name)

  const { view } = useSearch({ from: '/$name/records' })

  if (isLoading) return <div>Loading...</div>
  if (error || !data) {
    if (error) return <div>Error: {error.message}</div>
    return <div>Could not load records</div>
  }

  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full">
            <RecordView {...{ view, name }} records={data.records} />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
