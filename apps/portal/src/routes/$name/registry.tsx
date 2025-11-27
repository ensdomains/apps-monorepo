import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import type { NameChainLocation } from '@/features/registry/components/NetworkCard'
import { NoRegistryCard } from '@/features/registry/components/NoRegistryCard'
import { ParentRegistrySection } from '@/features/registry/components/ParentRegistrySection'
import { RegistryCard } from '@/features/registry/components/RegistryCard'
import { RegistryHeaderCards } from '@/features/registry/components/RegistryHeaderCards'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { useNameRegistryDiscovery } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getParentName } from '@/features/registry/utils/nameUtils'
import { sepoliaEthRegistryAddress } from '@/lib/constants/registry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/registry' })

  const {
    data,
    isLoading: isLoadingOwner,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  const chainLocation = data?.network

  const {
    currentRegistry,
    parentRegistry,
    hasCurrentRegistry,
    isLoading: isLoadingCards,
    error: cardsError,
  } = useNameRegistryDiscovery({
    name,
    chainLocation,
    enabled: !isLoadingOwner,
  })

  const isNamechain = chainLocation === 'namechainSepolia'
  const factory =
    chainLocation === 'sepolia'
      ? sepoliaVerifiableFactory
      : chainLocation === 'namechainSepolia'
        ? namechainVerifiableFactory
        : null

  const showVerifiedBanner = Boolean(hasCurrentRegistry && isNamechain)

  if (isLoadingOwner || isLoadingCards) {
    return <LoadingSpinner title="Loading registry" />
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : ((error as { message?: string })?.message ?? 'Unknown error')

    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Error: {message}</div>
      </div>
    )
  }

  if (cardsError) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Error: {cardsError.message}</div>
      </div>
    )
  }

  const sepoliaNetwork: NameChainLocation = {
    name: 'Sepolia',
    location: 'sepolia',
    chainId: sepolia.id,
    registryAddress: sepoliaEthRegistryAddress,
  }

  const namechainNetwork: NameChainLocation = {
    name: 'Namechain',
    location: 'namechainSepolia',
    chainId: sepolia.id,
    registryAddress: data?.registryAddress ?? null,
  }

  const currentNetwork = isNamechain ? namechainNetwork : sepoliaNetwork
  const parentNetwork = currentNetwork

  // ─────────────────────────────
  // Case 1: Name has NO registry
  // ─────────────────────────────
  if (!hasCurrentRegistry) {
    return (
      <div className="flex flex-col gap-6 p-4 w-full lg|max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>

        <NoRegistryCard />

        {parentRegistry && (
          <>
            {/* Parent top row */}
            <ParentRegistrySection
              parent={{
                name: getParentName(name) || 'eth',
                address: parentRegistry,
              }}
              owner={{
                address: data?.owner ?? zeroAddress,
              }}
              network={parentNetwork}
            />

            {/* Parent details card */}
            <RegistryCard
              registry={{
                address: parentRegistry,
                owner: {
                  address: data?.owner ?? zeroAddress,
                },
                network: parentNetwork,
                protocol: 'ENSv2',
                factory,
              }}
            />
          </>
        )}
      </div>
    )
  }

  // ─────────────────────────────
  // Case 2: Name HAS a registry
  // ─────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <h1 className="text-[28px] font-medium leading-none">Registry</h1>

      {showVerifiedBanner && <VerifiedRegistryCard />}

      {currentRegistry && (
        <>
          <RegistryHeaderCards
            owner={{
              name: undefined,
              address: data?.owner ?? zeroAddress,
            }}
            network={{
              name: currentNetwork.name,
              location: chainLocation ?? 'sepolia',
            }}
          />

          <RegistryCard
            registry={{
              address: currentRegistry,
              owner: {
                address: data?.owner ?? zeroAddress,
              },
              network: {
                name: currentNetwork.name,
                chainId: currentNetwork.chainId,
              },
              protocol: 'ENSv2',
              factory,
            }}
          />
        </>
      )}

      {parentRegistry && (
        <>
          <ParentRegistrySection
            parent={{
              name: getParentName(name) || 'eth',
              address: parentRegistry,
            }}
            owner={{
              address: data?.owner ?? zeroAddress,
            }}
            network={parentNetwork}
          />

          <RegistryCard
            registry={{
              address: parentRegistry,
              owner: {
                address: data?.owner ?? zeroAddress,
              },
              network: {
                name: parentNetwork.name,
                chainId: parentNetwork.chainId,
              },
              protocol: 'ENSv2',
              factory,
            }}
          />
        </>
      )}
    </div>
  )
}
