import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { Address } from 'viem'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { RegistryRolesTable } from '@/features/registry/components/v2/RegistryRolesTable'

export const Route = createFileRoute('/registry/$address/roles')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address } = Route.useParams()

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-heading font-medium leading-none">
          Roles
        </h1>
        {/* TODO: wire up the add-user flow */}
        <Button variant="default" className="flex items-center gap-2">
          <Plus className="size-4" />
          Add User
        </Button>
      </div>
      <RegistryRolesTable address={address as Address} />
    </div>
  )
}
