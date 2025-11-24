import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import type { ChainLocation } from './useNameChainLocation'
import { useNameRegistryDiscovery } from './useNameRegistryDiscovery'
import { useRegistryOwners } from './useRegistryOwners'

export type RegistryCard = {
  registry: Address | null
  owner: Address | null
  chainId: number | null
  hasCurrentRegistry?: boolean
}

export type SubregistryInfo = {
  registry: Address
  depth: number
}

export type UseRegistryCardsReturn = {
  current: RegistryCard
  parent: RegistryCard
  all: SubregistryInfo[]
  isLoading: boolean
  error: Error | null
}

export function useRegistryCards({
  name,
  chainLocation,
}: {
  name: string
  chainLocation: ChainLocation | undefined
}) {
  const discovery = useNameRegistryDiscovery({ name, chainLocation })
  const {
    currentRegistry,
    parentRegistry,
    subregistries,
    hasCurrentRegistry,
    isLoading: isLoadingDiscovery,
    error: discoveryError,
  } = discovery

  const owners = useRegistryOwners({
    name,
    currentRegistry,
    parentRegistry,
  })

  const chainIdForCurrent = sepolia.id

  return {
    current: {
      registry: currentRegistry,
      owner: owners.currentOwner,
      chainId: chainIdForCurrent,
      hasCurrentRegistry,
    },
    parent: {
      registry: parentRegistry,
      owner: owners.parentOwner,
      chainId: chainLocation === 'L2' ? chainIdForCurrent : sepolia.id,
    },
    all: subregistries.map((r, i) => ({ registry: r, depth: i })),
    isLoading: isLoadingDiscovery || owners.isLoading,
    error: (discoveryError || owners.error) as Error | null,
  }
}
