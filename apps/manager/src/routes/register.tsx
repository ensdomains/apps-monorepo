import { createFileRoute } from '@tanstack/react-router'
import { Registration } from '@/features/register/pages/RegistrationPage'
import { useSmartAccountContext } from '@/lib/smart-account'

interface RegisterSearch {
  name?: string
  duration?: number
}

function RegisterPage() {
  const { name, duration } = Route.useSearch()
  const { ownerAddress } = useSmartAccountContext()

  // Key the Registration component by owner address to force re-mount
  return (
    <Registration
      key={ownerAddress ?? 'disconnected'}
      initialName={name}
      initialDuration={duration}
    />
  )
}

export const Route = createFileRoute('/register')({
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    return {
      name: typeof search.name === 'string' ? search.name : undefined,
      duration:
        typeof search.duration === 'number'
          ? search.duration
          : typeof search.duration === 'string'
            ? Number.parseInt(search.duration, 10) || undefined
            : undefined,
    }
  },
})
