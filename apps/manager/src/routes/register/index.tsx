import { createFileRoute } from '@tanstack/react-router'
import { Registration } from '@/features/register/pages/RegistrationPage'
import { useSmartAccountContext } from '@/lib/smart-account'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

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
      initialDuration={duration}
      initialName={name}
      key={ownerAddress ?? 'disconnected'}
    />
  )
}

export const Route = createFileRoute('/register/')({
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    const rawName = typeof search.name === 'string' ? search.name : undefined
    const name = rawName ? normalizeDomainNameFromUrl(rawName) : undefined
    return {
      name: name && name !== '.eth' ? name : undefined,
      duration:
        typeof search.duration === 'number'
          ? search.duration
          : typeof search.duration === 'string'
            ? Number.parseInt(search.duration, 10) || undefined
            : undefined,
    }
  },
})
