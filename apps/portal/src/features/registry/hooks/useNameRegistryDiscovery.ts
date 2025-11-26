import type { Address } from 'viem'
import type { EnsNetworkName } from '@/utils/types'
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
  chainLocation?: EnsNetworkName
  enabled?: boolean
}): RegistryDiscovery {
  const isNamechain = chainLocation === 'namechainSepolia'
  const enabledL1 = enabled && !isNamechain
  const enabledL2 = enabled && isNamechain

  const l1 = useNameSubregistries({ name, enabled: enabledL1 })
  const l2 = useL2Subregistries({ name, enabled: enabledL2 })

  const src = isNamechain ? l2 : l1

  return src
}
