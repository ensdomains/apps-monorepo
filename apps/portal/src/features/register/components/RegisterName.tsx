import { BadgeCheck } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

type RegisterNameProps = {
  name: string | undefined
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Register ENS Name</h1>
          <p className="text-muted-foreground mt-1">
            {name ? `Register ${name}` : 'Enter a name to get started'}
          </p>
        </div>

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
      </div>
    </main>
  )
}
