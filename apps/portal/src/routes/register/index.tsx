import { createFileRoute } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import { NavBar } from '@/components/NavBar'
import { MessageCard } from '@/components/ui/message-card'
import { RegisterName } from '@/features/register/components'

interface RegisterSearch {
  name?: string
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      {!name ? (
        <MessageCard
          icon={<BadgeCheck className="size-8" strokeWidth={1.5} />}
          title="Registration coming soon"
          description={
            <div className="text-base">
              <p>
                Name registration will be available here soon. This page is a
                placeholder for the registration flow.
              </p>
              {name && (
                <p className="mt-2">
                  You selected: <strong>{name}</strong>
                </p>
              )}
            </div>
          }
          badge="Alpha"
          actionButton={{
            label: 'Back to Explorer',
            href: '/',
          }}
        />
      ) : (
        <RegisterName name={name} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/register/')({
  component: RegisterPage,
  staticData: { hideSidebar: true },
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    const rawName = typeof search.name === 'string' ? search.name : undefined
    const name = rawName?.trim() && rawName !== '.eth' ? rawName : undefined
    return {
      name,
    }
  },
})
