import type { Address } from 'viem'
import type { NetworkLocation } from '../components/NetworkCard'
import { useL2Subregistries } from './useL2Subregistries'
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
  chainLocation?: NetworkLocation
  enabled?: boolean
}): RegistryDiscovery {
  const isNamechain = chainLocation === 'sepoliaNamechain'
  const enabledL1 = enabled && !isNamechain
  const enabledL2 = enabled && isNamechain

  const l1 = useNameSubregistries({ name, enabled: enabledL1 })
  const l2 = useL2Subregistries({ name, enabled: enabledL2 })

  const src = isNamechain ? l2 : l1

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
