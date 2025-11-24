import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getNameRegistryQueryOptions } from '@/features/registry/hooks/useNameRegistry'

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
    <div className="flex-1">
      <span className="font-medium">Subregistry</span>

      {hasSubregistry ? (
        <CopyableRecord
          displayValue={`${data.registryAddress.slice(0, 6)}...${data.registryAddress.slice(-4)}`}
          value={data.registryAddress}
        />
      ) : (
        <div>No subregistry</div>
      )}
    </div>
  )
}
