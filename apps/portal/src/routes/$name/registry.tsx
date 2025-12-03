import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { EditIcon } from 'lucide-react'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import type { NameChainLocation } from '@/features/registry/components/NetworkCard'
import { NoRegistryCard } from '@/features/registry/components/NoRegistryCard'
import { ParentRegistrySection } from '@/features/registry/components/ParentRegistrySection'
import { RegistryCard } from '@/features/registry/components/RegistryCard'
import { RegistryHeaderCards } from '@/features/registry/components/RegistryHeaderCards'
import { RegistryHistory } from '@/features/registry/components/RegistryHistory'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getParentName } from '@/features/registry/utils/nameUtils'
import { sepoliaEthRegistryAddress } from '@/lib/constants/registry'

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

  const {
    data: registryData,
    isLoading: isLoadingRegistry,
    error: registryError,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled: !isLoadingOwner,
  })

  const registries = registryData?.registries ?? []
  const network = registryData?.network ?? null
  const protocolVersion = registryData?.protocolVersion ?? null
  const factory = registryData?.factory ?? null

  // For both V1 and V2 we rely on:
  // - registries.at(-2) = registry for `name`
  // - registries.at(-3) = registry for parent of `name` (if any)

  // For flo.eth: [.eth, flo.eth, .eth]
  // For sub.flo.eth: [.eth, flo.eth, sub.flo.eth, .eth]
  // So: .at(-1)=TLD, .at(-2)=name's registry, .at(-3)=parent's registry
  const nameRegistry = registries.at(-2) ?? null // Registry for this name
  const parentRegistry = registries.at(-3) ?? null // Registry for parent name
  const hasNameRegistry = !!nameRegistry && nameRegistry !== zeroAddress

  const isNamechain = network === 'namechainSepolia'
  const showVerifiedBanner = Boolean(hasNameRegistry && isNamechain)
  const isV1Name = protocolVersion === 'ENSv1'

  // Fetch parent owner separately
  // The parent registry (e.g., "eth" for "name.eth") has a different owner than the current name.
  // We need to query the parent name's owner to display the correct owner in the parent registry section.
  // Example: For "v1rtl.eth", the parent is "eth" which is owned by ENS DAO, not the v1rtl.eth owner.
  const parentName = getParentName(name)
  const {
    data: parentOwnerData,
    isLoading: isLoadingParentOwner,
    error: parentOwnerError,
  } = useQuery({
    ...getEnsOwnerQueryOptions({ name: parentName || 'eth' }),
    enabled: !!parentRegistry && !isLoadingOwner && !isLoadingRegistry,
  })

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

  if (registryError) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Error: {registryError.message}</div>
      </div>
    )
  }

  if (parentOwnerError) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <div>Error: {parentOwnerError.message}</div>
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
  if (!hasNameRegistry) {
    return (
      <div className="flex flex-col gap-6 p-4 w-full lg|max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>

        {isLoadingOwner || isLoadingRegistry ? (
          <LoadingSpinner title="Loading registry data..." />
        ) : (
          <NoRegistryCard />
        )}

        {parentRegistry &&
          (isLoadingParentOwner ? (
            <LoadingSpinner title="Loading parent owner data..." />
          ) : (
            <>
              {/* Parent top row */}
              <ParentRegistrySection
                parent={{
                  name: getParentName(name) || 'eth',
                  address: parentRegistry,
                }}
                owner={{
                  address: parentOwnerData?.owner ?? zeroAddress,
                }}
                network={parentNetwork}
              />

              {/* Parent details card */}
              <RegistryCard
                registry={{
                  address: parentRegistry,
                  owner: {
                    address: parentOwnerData?.owner ?? zeroAddress,
                  },
                  network: parentNetwork,
                  protocol: protocolVersion ?? 'ENSv2',
                  factory,
                }}
              />
            </>
          ))}
      </div>
    )
  }

  // ─────────────────────────────
  // Case 2: V1 Name
  // ─────────────────────────────
  // V1 names don't own subregistries - they're entries in the V1 ETH Registry.
  // Only show the parent registry section (the V1 ETH Registry where they're registered).
  if (isV1Name) {
    return (
      <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>

        {parentRegistry &&
          (isLoadingParentOwner ? (
            <LoadingSpinner title="Loading parent owner data..." />
          ) : (
            <>
              {/* Parent top row */}
              <ParentRegistrySection
                parent={{
                  name: getParentName(name) || 'eth',
                  address: parentRegistry,
                }}
                owner={{
                  address: parentOwnerData?.owner ?? zeroAddress,
                }}
                network={parentNetwork}
              />

              {/* Parent details card */}
              <RegistryCard
                registry={{
                  address: parentRegistry,
                  owner: {
                    address: parentOwnerData?.owner ?? zeroAddress,
                  },
                  network: parentNetwork,
                  protocol: protocolVersion ?? 'ENSv1',
                  factory,
                }}
              />
            </>
          ))}
      </div>
    )
  }

  // ─────────────────────────────
  // Case 3: V2 Name with registry
  // ─────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        <Button variant="outline" className="flex items-center gap-2" asChild>
          <Link to="/$name/deploy-registry" params={{ name }}>
            <EditIcon className="size-4" />
            Change registry
          </Link>
        </Button>
      </div>

      {showVerifiedBanner && <VerifiedRegistryCard />}

      {isLoadingOwner || isLoadingRegistry ? (
        <LoadingSpinner title="Loading registry data..." />
      ) : (
        nameRegistry && (
          <>
            <RegistryHeaderCards
              owner={{
                name: undefined,
                address: data?.owner ?? zeroAddress,
              }}
              network={{
                name: currentNetwork.name,
                location: network ?? 'sepolia',
              }}
            />

            <RegistryCard
              registry={{
                address: nameRegistry,
                owner: {
                  address: data?.owner ?? zeroAddress,
                },
                network: {
                  name: currentNetwork.name,
                  chainId: currentNetwork.chainId,
                },
                protocol: protocolVersion ?? 'ENSv2',
                factory,
              }}
            />
          </>
        )
      )}

      {parentRegistry &&
        (isLoadingParentOwner ? (
          <LoadingSpinner title="Loading parent owner data..." />
        ) : (
          <>
            <ParentRegistrySection
              parent={{
                name: getParentName(name) || 'eth',
                address: parentRegistry,
              }}
              owner={{
                address: parentOwnerData?.owner ?? zeroAddress,
              }}
              network={parentNetwork}
            />

            <RegistryCard
              registry={{
                address: parentRegistry,
                owner: {
                  address: parentOwnerData?.owner ?? zeroAddress,
                },
                network: {
                  name: parentNetwork.name,
                  chainId: parentNetwork.chainId,
                },
                protocol: protocolVersion ?? 'ENSv2',
                factory,
              }}
            />
          </>
        ))}

      {nameRegistry && nameRegistry !== zeroAddress && (
        <RegistryHistory
          registryAddress={nameRegistry}
          label={name.split('.')[0]}
        />
      )}
    </div>
  )
}
