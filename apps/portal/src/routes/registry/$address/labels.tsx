import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { RegistryLabelsTable } from '@/features/registry/components/v2/RegistryLabelsTable'
import { useRegistry } from '@/features/registry/hooks/useRegistry'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/registry/$address/labels')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address
  const { data: registry, isLoading, error } = useRegistry(address)

  if (isLoading) return <LoadingSpinner title="Loading registry" />

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
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-8 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Labels
      </h1>
      <RegistryLabelsTable address={address} />
    </div>
  )
}
