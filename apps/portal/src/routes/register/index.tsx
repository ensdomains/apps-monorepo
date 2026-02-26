import { createFileRoute } from '@tanstack/react-router'
import { LanguagesIcon } from 'lucide-react'
import { NavBar } from '@/components/NavBar'
import { MessageCard } from '@/components/ui/message-card'
import { RegisterName } from '@/features/register/components'

interface RegisterSearch {
  readonly name?: string
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      {!name ? (
        <MessageCard
          icon={<LanguagesIcon className="size-8" strokeWidth={1.5} />}
          title="Search for a name to register"
          description={
            <div className="text-base">
              <p>
                Search for a name using the search bar above, then select or
                enter the name to proceed with the registration flow.
              </p>
            </div>
          }
          badge="Alpha"
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
