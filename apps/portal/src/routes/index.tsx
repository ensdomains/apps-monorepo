import { createFileRoute } from '@tanstack/react-router'
import { NavBar } from '@/components/ui/NavBar'
import { useTheme } from '@/hooks/use-theme'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const { toggleTheme, theme } = useTheme()

  return <NavBar />
}
