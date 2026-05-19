import { useQuery } from '@tanstack/react-query'
import { type Address, getChainContractAddress, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { sepoliaWithEns } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ProtocolVersion } from '@/utils/types'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'
import { RegistryTreeItem } from './RegistryTreeItem'

const namechainVerifiableFactory = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

const chainId = sepoliaWithEns.id

export const RegistryTree = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const labels = name.split('.')
  const firstLabel = labels[0]

  const {
    data: registries,
    isLoading,
    error,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const { address: account } = useConnection()

  if (isLoading) return <LoadingSpinner title="Loading registry info" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.message || error.cause.message}
      />
    )

  if (!registries) return null

  // findRegistries returns `[name's subregistry, ...ancestors..., root]`
  // per LibRegistry.sol. For any depth ≥ 2LD:
  //   - registries[0] is the name's own subregistry slot (may be zero).
  //   - registries[1] is the immediate parent registry — the one that
  //     holds this name's label and that the role check / deploy flow
  //     target. The .eth registry happens to be at registries[1] for
  //     2LDs; for deeper names it sits further along the array.
  const nameSubregistry = registries.at(0)
  const parentRegistry = registries.at(1)

  const hasNameSubregistry =
    nameSubregistry !== undefined && nameSubregistry !== zeroAddress

  return (
    <div className="mt-8 sm:mt-12 mb-4">
      <div className="flex flex-col gap-2">
        {registries.map((registry, index) => {
          if (registry === null) return null

          return (
            <RegistryTreeItem
              chainId={chainId}
              key={registry}
              name={name}
              ownerData={ownerData}
              index={index}
              registriesCount={registries.length}
              address={registry}
            />
          )
        })}
      </div>

      {/* <RegistryCardsGrid
        label={firstLabel}
        protocol={ownerData.protocolVersion}
        owner={ownerData.owner}
        contractAddress={
          hasNameSubregistry ? (nameSubregistry as Address) : undefined
        }
        factoryAddress={
          hasNameSubregistry ? namechainVerifiableFactory : undefined
        }
        chainId={chainId}
      />

      {parentRegistry && (
        <>
          <h2 className="leading-none text-heading font-medium">
            Parent Registry
          </h2>
          <RegistryCardsGrid
            label={labels[1]}
            protocol={ownerData.protocolVersion}
            contractAddress={parentRegistry}
            chainId={chainId}
          />
        </>
      )} */}
    </div>
  )
}
