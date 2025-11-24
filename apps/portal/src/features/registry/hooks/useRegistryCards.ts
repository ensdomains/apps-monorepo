import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { isZeroAddress } from '@/lib/utils'
import { splitLabels } from '../utils/nameUtils'
import { useL2Subregistries } from './useL2Subregistries'
import { useNameSubregistries } from './useNameSubregistries'
import { getRegistryOwnerQueryOptions } from './useRegistryOwner'

export type RegistryCard = {
  registry: Address | null
  owner: Address | null
  chainId: number | null
  hasCurrentRegistry?: boolean
}

export type SubregistryInfo = {
  registry: Address
  depth: number
}

export type UseRegistryCardsReturn = {
  current: RegistryCard
  parent: RegistryCard
  all: SubregistryInfo[]
  isLoading: boolean
  error: Error | null
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export function useRegistryCards({
  name,
  chainLocation,
}: {
  name: string
  chainLocation: 'L1' | 'L2' | 'unknown' | undefined
}): UseRegistryCardsReturn {
  const isL2 = chainLocation === 'L2'
  const isL1 = !isL2 // treat unknown as L1 ancestry

  // ----------------------------------------------------------------------
  // 1. REGISTRY DISCOVERY (current + parent)
  // ----------------------------------------------------------------------

  const {
    currentRegistry: l1CurrentRegistry,
    parentRegistry: l1ParentRegistry,
    subregistries: l1Subregistries,
    hasCurrentRegistry: l1HasCurrentRegistry,
    isLoading: isLoadingL1,
    error: l1Error,
  } = useNameSubregistries({ name, enabled: isL1 })

  const {
    currentRegistry: l2CurrentRegistry,
    parentRegistry: l2ParentRegistry,
    subregistries: l2Subregistries,
    hasCurrentRegistry: l2HasCurrentRegistry,
    isLoading: isLoadingL2,
    error: l2Error,
  } = useL2Subregistries({ name, enabled: isL2 })

  // Pick correct chain registries
  const currentRegistry = isL2 ? l2CurrentRegistry : l1CurrentRegistry
  const parentRegistry = isL2 ? l2ParentRegistry : l1ParentRegistry
  const subregistries = (isL2 ? l2Subregistries : l1Subregistries) ?? []
  const hasCurrentRegistry = isL2 ? l2HasCurrentRegistry : l1HasCurrentRegistry

  // ----------------------------------------------------------------------
  // 2. DETERMINE LABELS for owner lookups (ENSv2 uses label → token)
  //
  //  flo.eth         current label = "flo"
  //  test.flo.eth    current label = "test", parent label = "flo"
  // ----------------------------------------------------------------------

  const labels = splitLabels(name)

  const currentLabel = labels[0] // leftmost
  const parentLabel = labels[1] ?? null // second leftmost

  // ----------------------------------------------------------------------
  // 3. OWNER LOOKUPS – LABEL-BASED (NO namehash, NO tokenId manually)
  // ----------------------------------------------------------------------

  const shouldFetchCurrentOwner = !isZeroAddress(currentRegistry)
  const shouldFetchParentOwner = !isZeroAddress(parentRegistry) && !!parentLabel

  const {
    data: currentOwner,
    isLoading: isLoadingCurrentOwner,
    error: currentOwnerError,
  } = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: currentRegistry ?? ZERO_ADDRESS,
      label: currentLabel,
    }),
    enabled: shouldFetchCurrentOwner,
  })

  const {
    data: parentOwner,
    isLoading: isLoadingParentOwner,
    error: parentOwnerError,
  } = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: parentRegistry ?? ZERO_ADDRESS,
      label: parentLabel ?? '',
    }),
    enabled: shouldFetchParentOwner,
  })

  // ----------------------------------------------------------------------
  // 4. BUILD RETURN STRUCTURE
  // ----------------------------------------------------------------------

  const chainIdForCurrent = sepolia.id // TODO: use real namechain chainId later

  const current: RegistryCard = {
    registry: currentRegistry,
    owner: (currentOwner as Address) || null,
    chainId: chainIdForCurrent,
    hasCurrentRegistry,
  }

  const parent: RegistryCard = {
    registry: parentRegistry,
    owner: (parentOwner as Address) || null,
    chainId: isL2 ? chainIdForCurrent : 11155111, // mainnet/sepolia for parent
  }

  const all: SubregistryInfo[] = subregistries.map((registry, index) => ({
    registry,
    depth: index,
  }))

  const isLoading =
    isLoadingL1 || isLoadingL2 || isLoadingCurrentOwner || isLoadingParentOwner

  const error = (l1Error ||
    l2Error ||
    currentOwnerError ||
    parentOwnerError) as Error | null

  return {
    current,
    parent,
    all,
    isLoading,
    error,
  }
}
