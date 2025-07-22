
import { createFileRoute, useParams } from '@tanstack/react-router'
import { PencilLineIcon, SearchIcon } from 'lucide-react'
import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { RecordsTable } from '@/components/organisms/RecordsTable/RecordsTable'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useCanEditRecords } from '@/features/profile/hooks/useCanEditRecords'
import { getProfileQueryOptions, useProfile } from '@/features/profile/hooks/useProfile'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/records')({
  component: App,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(params.name))
  },
})



function App() {
  const { name } = useParams({ from: '/$name/records' })
  const { data, isLoading, isError } = useProfile(name)
  const { data: canEditRecords } = useCanEditRecords({ name })


  if (isLoading) return <div>Loading...</div>
  if (isError || !data) return <div>Could not load records</div>


  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full">
            <header className="bg-gray-100 px-8 pb-4 pt-12 flex flex-col gap-4">
              <div className="flex flex-row justify-between">
                <h1 className="text-[28px] font-medium">Records</h1>
                {canEditRecords && <button type="button" className="bg-white text-black rounded-sm py-2 px-4 font-medium flex flex-row items-center gap-2 cursor-pointer">
                  <PencilLineIcon height={24} width={24} />
                  Edit Records
                </button>}
              </div>
              <div className="flex flex-row gap-2 w-full bg-white  rounded-sm p-2">
                <label htmlFor="search-records" aria-label="Search records">
                  <SearchIcon />
                </label>
                <input
                  id="search-records"
                  className="w-full "
                  placeholder="Search records..."
                />
              </div>
            </header>
            <RecordsTable records={data.records} />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
