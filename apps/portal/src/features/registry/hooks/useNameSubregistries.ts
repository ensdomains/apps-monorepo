import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { L1_ETH_REGISTRY } from '@/lib/constants/registry'
import { isZeroAddress } from '@/lib/utils'
import { REGISTRY_CACHE } from '../../../lib/query/cache'
import { splitLabels } from '../utils/nameUtils'
import { getNameRegistry, nameRegistryQueryKey } from './useNameRegistry'

export type UseNameSubregistriesParams = {
  name: string
  enabled?: boolean
}

export type UseNameSubregistriesReturn = {
  rootRegistry: Address | null
  currentRegistry: Address | null
  parentRegistry: Address | null
  subregistries: readonly Address[]
  hasCurrentRegistry: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * L1-oriented registry walk for ENS v2.
 *
 * Starts from L1_ETH_REGISTRY and walks labels right-to-left.
 * Uses getNameRegistry under the hood, which checks L1 first and
 * falls back to Namechain if needed, but for the L1_ETH_REGISTRY root
 * we effectively only care about the L1 registry.
 *
 * Steps:
 *  - labels = ["test", "flo", "eth"]
 *  - path = ["test", "flo"]
 *  - reversed = ["flo", "test"]
 *
 *  parent = L1_ETH_REGISTRY
 *  flo  → registry(flo.eth)
 *  test → registry(test.flo.eth)
 */
export function useNameSubregistries({
  name,
  enabled = true,
}: UseNameSubregistriesParams): UseNameSubregistriesReturn {
  const labels = splitLabels(name)

  const tooShort = labels.length < 2
  const pathLabels = tooShort ? [] : labels.slice(0, -1)
  const reversed = [...pathLabels].reverse()

  const query = useQuery({
    queryKey: nameRegistryQueryKey({
      registryAddress: L1_ETH_REGISTRY,
      label: reversed[0] ?? '',
    }),

    queryFn: async () => {
      if (tooShort) return { registries: [] }

      let parent: Address = L1_ETH_REGISTRY
      const registries: Address[] = []

      for (const label of reversed) {
        const step = await getNameRegistry({
          registryAddress: parent,
          label,
        })

        if (step.isErr()) throw step.error

        const registryAddress = step.value.registryAddress as Address
        registries.unshift(registryAddress)

        if (isZeroAddress(registryAddress)) break
        parent = registryAddress
      }

      return { registries }
    },

    enabled,
    ...REGISTRY_CACHE,
    placeholderData: (prev) => prev,
  })

  // For too-short names, skip the registry-return logic
  if (tooShort) {
    return {
      rootRegistry: L1_ETH_REGISTRY,
      currentRegistry: null,
      parentRegistry: null,
      subregistries: [],
      hasCurrentRegistry: false,
      isLoading: false,
      error: null,
    }
  }

  const registries = query.data?.registries ?? []

  const currentRegistry = registries[0] ?? null
  const parentRegistry = registries[1] ?? L1_ETH_REGISTRY
  const hasCurrentRegistry =
    !!currentRegistry && !isZeroAddress(currentRegistry)

  return {
    rootRegistry: L1_ETH_REGISTRY,
    currentRegistry,
    parentRegistry,
    subregistries: registries,
    hasCurrentRegistry,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
