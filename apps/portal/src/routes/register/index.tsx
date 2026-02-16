import { createFileRoute, Link } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import { NavBar } from '@/components/NavBar'
import { MessageCard } from '@/components/ui/message-card'

interface RegisterSearch {
  name?: string
  duration?: number
}

const RegisterPage = () => {
  const { name } = Route.useSearch()

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold">Register ENS Name</h1>
            <p className="text-muted-foreground mt-1">
              {name ? `Register ${name}` : 'Enter a name to get started'}
            </p>
          </div>

          <MessageCard
            icon={<BadgeCheck size={30} strokeWidth={1.5} />}
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

          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-muted-foreground">
            <p>Placeholder: Pricing, duration selector, and payment flow</p>
            <p className="mt-2">
              <Link to="/" className="underline hover:no-underline">
                Return home
              </Link>
            </p>
          </div>
        </div>
      </main>
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
      duration:
        typeof search.duration === 'number'
          ? search.duration
          : typeof search.duration === 'string'
            ? Number.parseInt(search.duration, 10) || undefined
            : undefined,
    }
  },
})
