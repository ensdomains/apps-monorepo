import { createFileRoute } from '@tanstack/react-router'
import { NavBar } from '@/components/NavBar'
import { RegisterName } from '@/features/register/components'

interface RegisterSearch {
  name?: string
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <RegisterName name={name} />
    </div>
  )
}

export const Route = createFileRoute('/register/')({
  component: RegisterPage,
  staticData: { hasSidebar: false },
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    const rawName = typeof search.name === 'string' ? search.name : undefined
    const name = rawName?.trim() && rawName !== '.eth' ? rawName : undefined
    return {
      name,
    }
  },
})
