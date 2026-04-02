import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getNameRegistryQueryOptions } from '@/features/registry/hooks/useNameRegistry'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const RegistryLocation = ({
  name,
  registryAddress,
}: {
  name: string
  registryAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getNameRegistryQueryOptions({ label: name.split('.')[0], registryAddress }),
  )

  if (error) return <div>{error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data) return null

  const hasSubregistry = data.registryAddress !== zeroAddress

  return (
    <div className="flex-1 flex flex-col gap-1">
      <span className="font-medium">Subregistry</span>

      {hasSubregistry ? (
        <EntityBadge variant="contract">
          {truncateAddress(data.registryAddress, 6, 4, '...')}
        </EntityBadge>
      ) : (
        <div>No subregistry</div>
      )}
    </div>
  )
}
