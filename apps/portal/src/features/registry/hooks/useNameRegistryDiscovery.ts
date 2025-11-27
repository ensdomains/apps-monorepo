import { useQueries } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
  namechainEthRegistryAddress,
  sepoliaEthRegistryAddress,
} from '@/lib/constants/registry'
import type { WagmiClientError } from '@/lib/wagmi/helpers'
import type { EnsNetworkName } from '@/utils/types'
import {
  getL1NameRegistriesQueryOptions,
  type L1NameRegistriesError,
} from './useL1Subregistries'
import {
  getL2NameRegistriesQueryOptions,
  type L2NameRegistriesError,
} from './useL2Subregistries'
import type { NameRegistryError } from './useNameRegistry'

export type RegistryDiscoveryError =
  | L1NameRegistriesError
  | L2NameRegistriesError
  | WagmiClientError
  | NameRegistryError

export type RegistryDiscoveryReturnType = {
  rootRegistry: Address | null
  currentRegistry: Address | null
  parentRegistry: Address | null
  subregistries: readonly Address[]
  hasCurrentRegistry: boolean
  isLoading: boolean
  error: RegistryDiscoveryError | null
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
      },
      // L2 Query
      {
        ...getL2NameRegistriesQueryOptions({ name }),
        enabled: enabled && isNamechain,
      },
    ],
  })

  // L1 Result - data is already unwrapped by resultQueryOptions
  if (!isNamechain) {
    return {
      rootRegistry: l1Query.data?.rootRegistry ?? sepoliaEthRegistryAddress,
      currentRegistry: l1Query.data?.currentRegistry ?? null,
      parentRegistry: l1Query.data?.parentRegistry ?? null,
      subregistries: (l1Query.data?.registries ?? []) as readonly Address[],
      hasCurrentRegistry: l1Query.data?.hasCurrentRegistry ?? false,
      isLoading: l1Query.isLoading,
      error: l1Query.error ?? null,
    }
  }

  // L2 Result - data is already unwrapped by resultQueryOptions
  return {
    rootRegistry: l2Query.data?.rootRegistry ?? namechainEthRegistryAddress,
    currentRegistry: l2Query.data?.currentRegistry ?? null,
    parentRegistry: l2Query.data?.parentRegistry ?? null,
    subregistries: (l2Query.data?.registries ?? []) as readonly Address[],
    hasCurrentRegistry: l2Query.data?.hasCurrentRegistry ?? false,
    isLoading: l2Query.isLoading,
    error: l2Query.error ?? null,
  }
}
