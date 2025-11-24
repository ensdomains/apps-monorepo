import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { L1_ETH_REGISTRY } from '@/lib/constants/registry'
import { isZeroAddress, ZERO_ADDRESS } from '@/lib/utils'
import { splitLabels } from '../utils/nameUtils'
import { getNameRegistryQueryOptions } from './useNameRegistry'

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
 * Canonical ENSv2 L1 registry walk.
 *
 * Starts from L1_ETH_REGISTRY and walks labels right-to-left.
 * Equivalent to the L2 walk but using the L1 registry root.
 *
 * Example:
 *   test.flo.eth →
 *     labels = ["test", "flo", "eth"]
 *     path   = ["test", "flo"]
 *     reversed = ["flo", "test"]
 *     Walk:
 *       L1_ETH_REGISTRY --flo--> registry(flo.eth)
 *       registry(flo.eth) --test--> registry(test.flo.eth)
 */
export function useNameSubregistries({
  name,
  enabled = true,
}: UseNameSubregistriesParams): UseNameSubregistriesReturn {
  // Extract path labels (everything except the TLD)
  const labels = splitLabels(name) // already returns left-to-right labels
  if (labels.length < 2) {
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

  // Drop TLD (.eth)
  const pathLabels = labels.slice(0, -1)
  const reversed = [...pathLabels].reverse()

  /**
   * Multi-step registry walk:
   * Step 1: Query registry for first label using L1_ETH_REGISTRY as root.
   * Step 2+: Query registry using the returned registries as parents.
   */
  const queries = reversed.map((label, index) => {
    const parent = index === 0 ? L1_ETH_REGISTRY : undefined // will be replaced later after the first results arrive

    return useQuery({
      ...getNameRegistryQueryOptions({
        registryAddress: parent ?? ZERO_ADDRESS,
        label,
      }),
      enabled,
    })
  })

  const results: Address[] = []

  for (let i = 0; i < reversed.length; i++) {
    const q = queries[i]

    if (!q.data) break

    const registryAddress = q.data.registryAddress as Address
    results.unshift(registryAddress)

    if (isZeroAddress(registryAddress)) break
  }

  const currentRegistry = results[0] ?? null
  const parentRegistryForName = results[1] ?? L1_ETH_REGISTRY
  const hasCurrentRegistry =
    !!currentRegistry && !isZeroAddress(currentRegistry)

  const anyLoading = queries.some((q) => q.isLoading)
  const anyError = queries.find((q) => q.error)?.error || null

  return {
    rootRegistry: L1_ETH_REGISTRY,
    currentRegistry,
    parentRegistry: parentRegistryForName,
    subregistries: results,
    hasCurrentRegistry,
    isLoading: anyLoading,
    error: anyError as Error | null,
  }
}
