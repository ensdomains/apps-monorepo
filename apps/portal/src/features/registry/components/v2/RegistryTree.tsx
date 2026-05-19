import { useQuery } from '@tanstack/react-query'
import { type Address, getChainContractAddress, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'

const namechainVerifiableFactory = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

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
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 sm:p-6 sm:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-medium leading-none">Registry</h1>
        {/* {parentRegistry &&
          parentRegistry !== zeroAddress &&
          account &&
          nameSubregistry !== undefined && ( // as long as it returns one, even if zero
            <DeploySubregistryButton
              name={name}
              registryAddress={parentRegistry}
              label={firstLabel}
              account={account}
            />
          )} */}
      </div>

      <RegistryCardsGrid
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
      )}
    </div>
  )
}
