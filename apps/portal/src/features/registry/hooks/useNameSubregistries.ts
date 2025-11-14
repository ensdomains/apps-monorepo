import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getNameRegistriesQueryOptions } from './useNameRegistries'

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Hook to get all subregistries for a given name
 * Determines if the name has its own registry deployed
 *
 * Index mapping from getNameRegistries:
 * [0] = Registry at the name level itself (current registry) - may be 0x0 if not deployed
 * [1] = Registry one level up (parent registry)
 * [2+] = Ancestor registries
 * [-1] = Root registry (global ENSv2 root)
 *
 * Note: This is only used for L1 names. L2 names use a different lookup strategy.
 */
export function useNameSubregistries({
  name,
  enabled = true,
}: UseNameSubregistriesParams): UseNameSubregistriesReturn {
  // Fetch all registries for the name
  const {
    data: registriesData,
    isLoading: isLoadingRegistries,
    error: registriesError,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled,
  })

  const registries = (registriesData || []) as readonly Address[]

  const rootRegistry = registries.at(-1) ?? null
  const allRegistriesExceptRoot = registries.slice(0, -1)

  const currentRegistry = registries[0] ?? null
  const parentRegistry = registries[1] ?? null

  // The name has its own registry if currentRegistry is non-zero
  // No need to query parent - the array tells us directly
  const hasCurrentRegistry =
    currentRegistry !== null && currentRegistry !== ZERO_ADDRESS

  return {
    rootRegistry,
    currentRegistry,
    parentRegistry,
    subregistries: allRegistriesExceptRoot,
    hasCurrentRegistry,
    isLoading: isLoadingRegistries,
    error: registriesError as Error | null,
  }
}
