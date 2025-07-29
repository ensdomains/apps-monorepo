import { createFileRoute, useParams } from '@tanstack/react-router'
import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/$name/')({
  component: App,
})

function App() {
  const { name } = useParams({ from: '/$name/' })
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full">main</SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
