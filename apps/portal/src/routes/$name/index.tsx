import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { createFileRoute, useParams } from '@tanstack/react-router'

export const Route = createFileRoute('/$name/')({
  component: App,
})

function App() {

      const { name } = useParams({ from: '/$name/' })
  return (
    <>
      
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
        <main className="w-full">main</main>
        </div>
      </SidebarProvider>
    </>
  )
}
