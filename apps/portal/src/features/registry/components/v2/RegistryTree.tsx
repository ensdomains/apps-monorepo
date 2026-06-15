import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'
import { RegistryTreeItem } from './RegistryTreeItem'

const chainId = sepoliaWithEns.id

export const RegistryTree = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const labels = name.split('.')

  const {
    data: registries,
    isLoading,
    error,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  if (isLoading) return <LoadingSpinner title="Loading registry info" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.message || error.cause.message}
      />
    )

  if (!registries) return null

  return (
    <div className="mt-8 sm:mt-12 mb-4">
      <div className="flex flex-col">
        {[...registries].reverse().map((registry, index) => {
          if (registry === null) return null

          const label = labels[registries.length - index - 1]
          const levelName = labels
            .slice(registries.length - index - 1)
            .join('.')

          return (
            <RegistryTreeItem
              chainId={chainId}
              name={name}
              key={levelName}
              ownerData={ownerData}
              index={index}
              registriesCount={registries.length}
              address={registry}
              label={label}
            />
          )
        })}
      </div>
    </div>
  )
}
