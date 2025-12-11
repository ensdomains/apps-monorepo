import { createFileRoute, Outlet, useParams } from '@tanstack/react-router'
import { NavBar } from '@/components/molecules/NavBar'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/$name')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name' })
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full min-w-0">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
