import { createFileRoute, Outlet, useParams } from '@tanstack/react-router'
import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/$name')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name' })
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <NavBar />
      <SidebarProvider className="flex flex-col">
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
