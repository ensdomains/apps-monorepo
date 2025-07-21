import { createFileRoute, useParams } from '@tanstack/react-router'
import { NavBar } from '@/components/molecules/NavBar'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/$name/records')({
  component: App,
})

function App() {

  const { name } = useParams({ from: '/$name/records' })
  return (
    <>
      <NavBar />
      <SidebarProvider>
        <ProfileSidebar name={name} />
        <main></main>
      </SidebarProvider>
    </>
  )
}
