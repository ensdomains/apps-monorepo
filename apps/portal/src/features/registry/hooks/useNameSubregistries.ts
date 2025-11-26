import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { sepoliaEthRegistryAddress } from '@/lib/constants/registry'
import { REGISTRY_CACHE } from '@/lib/query/cache'
import { isZeroAddress } from '@/lib/utils'
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
 * Starts from sepoliaEthRegistryAddress and walks labels right-to-left.
 * Uses getNameRegistry under the hood, which checks L1 first and
 * falls back to Namechain if needed, but for the sepoliaEthRegistryAddress root
 * we effectively only care about the L1 registry.
 *
 * Steps:
 *  - labels = ["test", "flo", "eth"]
 *  - path = ["test", "flo"]
 *  - reversed = ["flo", "test"]
 *
 *  parent = sepoliaEthRegistryAddress
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
  const reversed = pathLabels.toReversed()

  const query = useQuery({
    queryKey: nameRegistryQueryKey({
      registryAddress: sepoliaEthRegistryAddress,
      label: reversed[0] ?? '',
    }),
    queryFn: async () => {
      if (tooShort) return { registries: [] as Address[] }

      let parent: Address = sepoliaEthRegistryAddress
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

  if (tooShort) {
    return {
      rootRegistry: sepoliaEthRegistryAddress,
      currentRegistry: null,
      parentRegistry: null,
      subregistries: [],
      hasCurrentRegistry: false,
      isLoading: false,
      error: null,
    }
  }

  const registries = (query.data?.registries ?? []) as readonly Address[]
  const currentRegistry = registries[0] ?? null
  const parentRegistry = registries[1] ?? sepoliaEthRegistryAddress
  const hasCurrentRegistry =
    !!currentRegistry && !isZeroAddress(currentRegistry)

  return {
    rootRegistry: sepoliaEthRegistryAddress,
    currentRegistry,
    parentRegistry,
    subregistries: registries,
    hasCurrentRegistry,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
