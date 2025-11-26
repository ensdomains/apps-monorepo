import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import type { NameChainLocation } from '@/features/registry/components/NetworkCard'
import { NoRegistryCard } from '@/features/registry/components/NoRegistryCard'
import { ParentRegistrySection } from '@/features/registry/components/ParentRegistrySection'
import { RegistryCard } from '@/features/registry/components/RegistryCard'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { getNameChainLocationQueryOptions } from '@/features/registry/hooks/useNameChainLocation'
import { useRegistryCards } from '@/features/registry/hooks/useRegistryCards'
import { getParentName, splitLabels } from '@/features/registry/utils/nameUtils'
import { RegistryHeaderCards } from '../../features/registry/components/RegistryHeaderCards'
import { L1_ETH_REGISTRY } from '../../lib/constants/registry'

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/registry' })
  const labels = splitLabels(name)

  // registrable (2LD) label:
  // flo.eth      -> flo
  // test.flo.eth -> flo
  const registrableLabel =
    labels.length >= 2 ? labels[labels.length - 2] : labels[0]

  // Find where the registrable label lives (L1/L2)
  const { data: chainLocation, isLoading: isLoadingChainLocation } = useQuery(
    getNameChainLocationQueryOptions({ label: registrableLabel }),
  )

  const {
    current,
    parent,
    isLoading: isLoadingCards,
    error,
  } = useRegistryCards({
    name,
    chainLocation: chainLocation?.location,
  })

  const isSepoliaNamechain = chainLocation?.location === 'sepoliaNamechain'
  const showVerifiedBanner = Boolean(
    current.hasCurrentRegistry && isSepoliaNamechain,
  )

  if (isLoadingCards || isLoadingChainLocation) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Loading...</div>
        {chainLocation && (
          <div className="text-sm text-gray-600">
            Detected chain: {chainLocation.name} ({chainLocation.location})
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Error: {error.message}</div>
      </div>
    )
  }

  const sepoliaNetwork: NameChainLocation = {
    name: 'Sepolia',
    location: 'sepolia',
    chainId: sepolia.id,
    registryAddress: L1_ETH_REGISTRY,
  }

  const currentNetwork = chainLocation ?? sepoliaNetwork
  const parentNetwork = chainLocation ?? sepoliaNetwork

  // ─────────────────────────────
  // Case 1: Name has NO registry
  // ─────────────────────────────
  if (!current.hasCurrentRegistry) {
    return (
      <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>

        <NoRegistryCard />

        {parent.registry && (
          <>
            {/* Parent top row */}
            <ParentRegistrySection
              parent={{
                name: getParentName(name) || 'eth',
                address: parent.registry,
              }}
              owner={{
                address: parent.owner ?? zeroAddress,
              }}
              network={parentNetwork}
            />

            {/* Parent details card */}
            <RegistryCard
              registry={{
                address: parent.registry,
                owner: {
                  address: parent.owner ?? zeroAddress,
                },
                network: parentNetwork,
                protocol: 'ENSv2',
                factory: parent.factory,
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

      {current.registry && (
        <>
          <RegistryHeaderCards
            owner={{
              name: undefined,
              address: current.owner ?? zeroAddress,
            }}
            network={{
              name: currentNetwork.name,
              location: chainLocation?.location ?? 'sepolia',
            }}
          />

          <RegistryCard
            registry={{
              address: current.registry,
              owner: {
                address: current.owner ?? zeroAddress,
              },
              network: {
                name: currentNetwork.name,
                chainId: currentNetwork.chainId,
              },
              protocol: 'ENSv2',
              factory: current.factory,
            }}
          />
        </>
      )}

      {parent.registry && (
        <>
          <ParentRegistrySection
            parent={{
              name: getParentName(name) || 'eth',
              address: parent.registry,
            }}
            owner={{
              address: parent.owner ?? zeroAddress,
            }}
            network={parentNetwork}
          />

          <RegistryCard
            registry={{
              address: parent.registry,
              owner: {
                address: parent.owner ?? zeroAddress,
              },
              network: {
                name: parentNetwork.name,
                chainId: parentNetwork.chainId,
              },
              protocol: 'ENSv2',
              factory: parent.factory,
            }}
          />
        </>
      )}
    </div>
  )
}
