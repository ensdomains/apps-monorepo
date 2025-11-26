import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  VERIFIABLE_FACTORY_L1,
  VERIFIABLE_FACTORY_L2,
} from '@/lib/constants/verifiableFactory'
import type { NetworkLocation } from '../components/NetworkCard'
import { useNameRegistryDiscovery } from './useNameRegistryDiscovery'
import { useRegistryOwners } from './useRegistryOwners'

export type RegistryCard = {
  registry: Address | null
  owner: Address | null
  chainId: number | null
  hasCurrentRegistry?: boolean
  factory: Address | null
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
  enabled = true,
}: {
  name: string
  chainLocation: NetworkLocation | undefined
  enabled?: boolean
}): UseRegistryCardsReturn {
  const discovery = useNameRegistryDiscovery({ name, chainLocation, enabled })

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
    enabled,
  })

  const chainIdForCurrent = sepolia.id

  const factory: Address | null =
    chainLocation === 'sepolia'
      ? VERIFIABLE_FACTORY_L1
      : chainLocation === 'sepoliaNamechain'
        ? VERIFIABLE_FACTORY_L2
        : null

  return {
    current: {
      registry: currentRegistry,
      owner: owners.currentOwner,
      chainId: chainIdForCurrent,
      hasCurrentRegistry,
      factory,
    },
    parent: {
      registry: parentRegistry,
      owner: owners.parentOwner,
      chainId: chainIdForCurrent, // both roots on Sepolia for now
      factory,
    },
    all: subregistries.map((r, i) => ({ registry: r, depth: i })),
    isLoading: isLoadingDiscovery || owners.isLoading,
    error: (discoveryError || owners.error) as Error | null,
  }
}
