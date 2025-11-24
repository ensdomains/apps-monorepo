import type { Address } from 'viem'
import { useL2Subregistries } from './useL2Subregistries'
import type { ChainLocation } from './useNameChainLocation'
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
  chainLocation: ChainLocation | undefined
  enabled?: boolean
}): RegistryDiscovery {
  const isL2 = chainLocation === 'L2'
  const enabledL1 = enabled && !isL2
  const enabledL2 = enabled && isL2

  const l1 = useNameSubregistries({ name, enabled: enabledL1 })
  const l2 = useL2Subregistries({ name, enabled: enabledL2 })

  const src = isL2 ? l2 : l1

  return {
    rootRegistry: src.rootRegistry,
    currentRegistry: src.currentRegistry,
    parentRegistry: src.parentRegistry,
    subregistries: src.subregistries,
    hasCurrentRegistry: src.hasCurrentRegistry,
    isLoading: src.isLoading,
    error: src.error,
  }
}
