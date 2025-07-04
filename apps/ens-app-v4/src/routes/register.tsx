import { createFileRoute } from '@tanstack/react-router'
import { Registration } from '@/features/register/pages/RegistrationPage'

interface RegisterSearch {
  name?: string
}

function RegisterPage() {
  const { name } = Route.useSearch()

  return <Registration initialName={name} />
}

export const Route = createFileRoute('/register')({
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    return {
      name: typeof search.name === 'string' ? search.name : undefined,
    }
  },
})
