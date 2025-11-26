import { useQueries } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
  namechainEthRegistryAddress,
  sepoliaEthRegistryAddress,
} from '@/lib/constants/registry'
import type { EnsNetworkName } from '@/utils/types'
import {
  getL1NameRegistriesQueryOptions,
  type L1NameRegistriesResult,
} from './useL1Subregistries'
import {
  getL2NameRegistriesQueryOptions,
  type L2NameRegistriesResult,
} from './useL2Subregistries'

export type RegistryDiscoveryReturnType = {
  rootRegistry: Address | null
  currentRegistry: Address | null
  parentRegistry: Address | null
  subregistries: readonly Address[]
  hasCurrentRegistry: boolean
  isLoading: boolean
  error: Error | null
}

export function useNameRegistryDiscovery({
  name,
  chainLocation,
  enabled = true,
}: {
  name: string
  chainLocation?: EnsNetworkName
  enabled?: boolean
}): RegistryDiscoveryReturnType {
  const isNamechain = chainLocation === 'namechainSepolia'

  const [l1Query, l2Query] = useQueries({
    queries: [
      // L1 Query
      {
        ...getL1NameRegistriesQueryOptions({ name }),
        enabled: enabled && !isNamechain,
        placeholderData: (prev: L1NameRegistriesResult | undefined) => prev,
      },
      // L2 Query
      {
        ...getL2NameRegistriesQueryOptions({ name }),
        enabled: enabled && isNamechain,
        placeholderData: (prev: L2NameRegistriesResult | undefined) => prev,
      },
    ],
  })

  // L1 Result
  if (!isNamechain) {
    const l1Data = l1Query.data as L1NameRegistriesResult | undefined

    return {
      rootRegistry: l1Data?.rootRegistry ?? sepoliaEthRegistryAddress,
      currentRegistry: l1Data?.currentRegistry ?? null,
      parentRegistry: l1Data?.parentRegistry ?? null,
      subregistries: (l1Data?.registries ?? []) as readonly Address[],
      hasCurrentRegistry: l1Data?.hasCurrentRegistry ?? false,
      isLoading: l1Query.isLoading,
      error: (l1Query.error as Error | null) ?? null,
    }
  }

  // L2 Result
  const l2Data = l2Query.data as L2NameRegistriesResult | undefined

  return {
    rootRegistry: l2Data?.rootRegistry ?? namechainEthRegistryAddress,
    currentRegistry: l2Data?.currentRegistry ?? null,
    parentRegistry: l2Data?.parentRegistry ?? null,
    subregistries: (l2Data?.registries ?? []) as readonly Address[],
    hasCurrentRegistry: l2Data?.hasCurrentRegistry ?? false,
    isLoading: l2Query.isLoading,
    error: (l2Query.error as Error | null) ?? null,
  }
}
