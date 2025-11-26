import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { namechainEthRegistryAddress } from '@/lib/constants/registry'
import type { EnsNetworkName } from '@/utils/types'
import {
  getL2NameRegistriesQueryOptions,
  type L2NameRegistriesResult,
} from './useL2Subregistries'
import { useNameSubregistries } from './useNameSubregistries'

export type RegistryDiscovery = {
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
}): RegistryDiscovery {
  const isNamechain = chainLocation === 'namechainSepolia'

  const l1 = useNameSubregistries({
    name,
    enabled: enabled && !isNamechain,
  })

  const l2Query = useQuery({
    ...getL2NameRegistriesQueryOptions({ name }),
    enabled: enabled && isNamechain,
    placeholderData: (prev) => prev,
  })

  const l2Data = l2Query.data as L2NameRegistriesResult | undefined

  const l2: RegistryDiscovery = {
    rootRegistry: l2Data?.rootRegistry ?? namechainEthRegistryAddress,
    currentRegistry: l2Data?.currentRegistry ?? null,
    parentRegistry: l2Data?.parentRegistry ?? null,
    subregistries: (l2Data?.registries ?? []) as readonly Address[],
    hasCurrentRegistry: l2Data?.hasCurrentRegistry ?? false,
    isLoading: l2Query.isLoading,
    error: (l2Query.error as Error | null) ?? null,
  }

  return isNamechain ? l2 : l1
}
