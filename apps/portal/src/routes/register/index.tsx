import { createFileRoute } from '@tanstack/react-router'
import { LanguagesIcon } from 'lucide-react'
import { PageContainer } from '@/components/PageContainer'
import { TopNav } from '@/components/TopNav'
import { MessageCard } from '@/components/ui/message-card'
import { RegisterName } from '@/features/register/components'

interface RegisterSearch {
  readonly name?: string
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <>
      <TopNav />
      <main className="w-full min-w-0">
        <PageContainer className="min-h-screen flex flex-col pt-4">
          {!name ? (
            <MessageCard
              icon={<LanguagesIcon className="size-6" strokeWidth={1.5} />}
              title="Search for a name to register"
              description={
                <div>
                  <p>
                    Search for a name using the search bar at the top of the
                    page, then select or enter the name to proceed with the
                    registration flow.
                  </p>
                </div>
              }
            />
          ) : (
            <RegisterName key={name} name={name} />
          )}
        </PageContainer>
      </main>
    </>
  )
}

export const Route = createFileRoute('/register/')({
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    const rawName = typeof search.name === 'string' ? search.name : undefined
    const name = rawName?.trim() && rawName !== '.eth' ? rawName : undefined
    return {
      name,
    }
  },
})
