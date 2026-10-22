import { createFileRoute } from '@tanstack/react-router'
import { LanguagesIcon } from 'lucide-react'
import { MobileHeader } from '@/components/MobileHeader'
import { PageContainer } from '@/components/PageContainer'
import { RegisterSidebar } from '@/components/RegisterSidebar'
import { MessageCard } from '@/components/ui/message-card'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { RegisterName } from '@/features/register/components'

interface RegisterSearch {
  readonly name?: string
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <SidebarProvider>
      <RegisterSidebar />
      <SidebarInset className="w-full min-w-0">
        <MobileHeader />
        <PageContainer className="min-h-screen flex flex-col pt-4">
          {!name ? (
            <MessageCard
              icon={<LanguagesIcon className="size-6" strokeWidth={1.5} />}
              title="Search for a name to register"
              description={
                <div>
                  <p>
                    Search for a name using the search bar in the sidebar, then
                    select or enter the name to proceed with the registration
                    flow.
                  </p>
                </div>
              }
            />
          ) : (
            <RegisterName key={name} name={name} />
          )}
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
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
