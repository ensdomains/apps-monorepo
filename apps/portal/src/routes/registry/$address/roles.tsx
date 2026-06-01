import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { RegistryAddUserSheet } from '@/features/registry/components/v2/RegistryAddUserSheet'
import { RegistryRolesTable } from '@/features/registry/components/v2/RegistryRolesTable'
import { useRegistry } from '@/features/registry/hooks/useRegistry'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/registry/$address/roles')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)

  const { data: registry, isLoading, error } = useRegistry(address)

  if (isLoading) return <LoadingSpinner title="Loading rolegistry" />

  if (error)
    return (
      <ErrorMessage
        title="Error loading registry"
        description={error.message}
      />
    )

  if (!registry)
    return (
      <NotFoundMessage
        title="Registry not found"
        description={
          <>
            <strong>{truncateAddress(address, 6, 4, '...')}</strong> is not a
            known registry contract.
          </>
        }
      />
    )

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-heading font-medium leading-none">
          Roles
        </h1>
        <Button
          variant="default"
          className="flex items-center gap-2"
          onClick={() => setIsAddUserOpen(true)}
        >
          <Plus className="size-4" />
          Add User
        </Button>
      </div>
      <RegistryRolesTable address={address} />
      <RegistryAddUserSheet
        open={isAddUserOpen}
        onOpenChange={setIsAddUserOpen}
        registryAddress={address}
      />
    </div>
  )
}
