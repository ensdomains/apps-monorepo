import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { NoRegistryCard } from '@/features/registry/components/NoRegistryCard'
import { ParentRegistrySection } from '@/features/registry/components/ParentRegistrySection'
import { RegistryCard } from '@/features/registry/components/RegistryCard'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { getNameChainLocationQueryOptions } from '@/features/registry/hooks/useNameChainLocation'
import { useRegistryCards } from '@/features/registry/hooks/useRegistryCards'
import { getParentName, splitLabels } from '@/features/registry/utils/nameUtils'
import { RegistryHeaderCards } from '../../features/registry/components/RegistryHeaderCards'
import { getNetworkMetaFromChainId } from '../../features/registry/utils/network'

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/registry' })

  const labels = splitLabels(name)

  // ⚠️ Important: we want the *registrable* label (2LD), not the left-most.
  // flo.eth        -> "flo"
  // test.flo.eth   -> "flo"
  const registrableLabel =
    labels.length >= 2 ? labels[labels.length - 2] : labels[0]

  // Determine which chain this name's *registry* lives on (L1/L2)
  const { data: chainLocation, isLoading: isLoadingChainLocation } = useQuery(
    getNameChainLocationQueryOptions({ label: registrableLabel }),
  )

  const { current, parent, isLoading, error } = useRegistryCards({
    name,
    chainLocation: chainLocation?.location,
    // registryAddress is ignored by the hook logic now, but we keep the arg
    // so callers don’t break.
    registryAddress: chainLocation?.registryAddress ?? null,
  })

  const isL2 = chainLocation?.location === 'L2'
  const showVerifiedBanner = !!current.hasCurrentRegistry && isL2

  const parentNetworkName = sepolia.name
  const parentChainId = sepolia.id

  if (isLoading || isLoadingChainLocation) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>
        <div>Loading...</div>
        {chainLocation && (
          <div className="text-sm text-gray-600">
            Detected chain: {chainLocation.chainName} ({chainLocation.location})
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>
        <div>Error: {error.message}</div>
      </div>
    )
  }

  // ─────────────────────────────
  // Case 1: No registry for this name
  // ─────────────────────────────
  if (!current.hasCurrentRegistry) {
    const parentNetwork = getNetworkMetaFromChainId(chainLocation?.chainId)

    return (
      <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>

        <NoRegistryCard />

        {parent.registry && (
          <>
            <ParentRegistrySection
              parent={{
                name: getParentName(name) || 'eth',
                address: parent.registry,
              }}
              owner={{
                address:
                  parent.owner ||
                  ('0x0000000000000000000000000000000000000000' as `0x${string}`),
              }}
              network={parentNetwork}
            />

            <RegistryCard
              registry={{
                address: parent.registry,
                owner: {
                  address:
                    parent.owner ||
                    ('0x0000000000000000000000000000000000000000' as `0x${string}`),
                },
                network: {
                  name: parentNetworkName,
                  chainId: parentChainId,
                },
                protocol: 'ENSv2',
              }}
            />
          </>
        )}
      </div>
    )
  }

  // ─────────────────────────────
  // Case 2: Name HAS a registry
  //   - If showVerifiedBanner = true -> "Verified subregistry" screen
  //   - Else -> "Unverified subregistry" screen
  // ─────────────────────────────

  const currentNetwork = getNetworkMetaFromChainId(
    chainLocation?.chainId ?? current.chainId,
  )
  const parentNetwork = getNetworkMetaFromChainId(parent.chainId)

  const ownerAddress = current.owner
  const hasOwner = !!ownerAddress && ownerAddress !== zeroAddress

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>

      {showVerifiedBanner && <VerifiedRegistryCard />}

      {current.registry && (
        <>
          <RegistryHeaderCards
            owner={{
              // we don’t have a primary name yet, so just let the card
              // shorten the address as it already does
              name: undefined,
              address: hasOwner ? ownerAddress! : zeroAddress,
            }}
            network={{
              name: chainLocation?.chainName || 'Unknown',
              location: chainLocation?.location ?? 'unknown',
            }}
          />

          <RegistryCard
            registry={{
              address: current.registry,
              owner: {
                address:
                  current.owner ||
                  ('0x0000000000000000000000000000000000000000' as `0x${string}`),
              },
              network: {
                name: currentNetwork.name,
                chainId: chainLocation?.chainId || current.chainId || 11155111,
              },
              protocol: 'ENSv2',
              factory: current.registry,
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
              address:
                parent.owner ||
                ('0x0000000000000000000000000000000000000000' as `0x${string}`),
            }}
            network={parentNetwork}
          />

          <RegistryCard
            registry={{
              address: parent.registry,
              owner: {
                address:
                  parent.owner ||
                  ('0x0000000000000000000000000000000000000000' as `0x${string}`),
              },
              network: {
                name: parentNetworkName,
                chainId: parentChainId,
              },
              protocol: 'ENSv2',
            }}
          />
        </>
      )}
    </div>
  )
}
