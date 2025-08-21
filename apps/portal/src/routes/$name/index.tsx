import { createFileRoute, useParams } from '@tanstack/react-router'
import { ProfileSidebar } from '@/components/molecules/ProfileSidebar'
export const Route = createFileRoute('/$name/')({
  component: App,
})

function App() {
  const { name } = useParams({ from: '/$name/' })
  return <ProfileSidebar name={name} />
}
