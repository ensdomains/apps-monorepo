import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  VERIFIABLE_FACTORY_L1,
  VERIFIABLE_FACTORY_L2,
} from '@/lib/constants/verifiableFactory'
import type { EnsNetworkName } from '@/utils/types'
import { useNameRegistryDiscovery } from './useNameRegistryDiscovery'

export type RegistryCard = {
  registry: Address | null
  chainId: number | null
  hasCurrentRegistry?: boolean
  factory: Address | null
}

export type SubregistryInfo = {
  registry: Address
  depth: number
}

export type UseRegistryCardsReturnType = {
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
  chainLocation: EnsNetworkName | undefined
  enabled?: boolean
}): UseRegistryCardsReturnType {
  const {
    currentRegistry,
    parentRegistry,
    subregistries,
    hasCurrentRegistry,
    isLoading,
    error,
  } = useNameRegistryDiscovery({ name, chainLocation, enabled })

  const chainIdForCurrent = sepolia.id

  const factory: Address | null =
    chainLocation === 'sepolia'
      ? VERIFIABLE_FACTORY_L1
      : chainLocation === 'namechainSepolia'
        ? VERIFIABLE_FACTORY_L2
        : null

  return {
    current: {
      registry: currentRegistry,
      chainId: chainIdForCurrent,
      hasCurrentRegistry,
      factory,
    },
    parent: {
      registry: parentRegistry,
      chainId: chainIdForCurrent,
      factory,
    },
    all: subregistries.map((r, i) => ({ registry: r, depth: i })),
    isLoading,
    error: error as Error | null,
  }
}
