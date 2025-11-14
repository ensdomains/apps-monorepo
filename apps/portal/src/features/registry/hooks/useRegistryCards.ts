import { useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { namehash } from 'viem/ens'
import { getParentName } from '../utils/nameUtils'
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

/**
 * Hook to fetch registry card data.
 *
 * L1:
 *  - Uses useNameSubregistries (getNameRegistries / UniversalResolver)
 *
 * L2:
 *  - Uses useL2Subregistries (walks hierarchy under L2 .eth registry
 *    using getNameRegistryAddress)
 *
 * Chain location (L1/L2/unknown) only decides which source to trust,
 * not whether a registry exists. Existence is based on whether the
 * current registry is non-zero.
 */
export function useRegistryCards({
  name,
  chainLocation,
}: {
  name: string
  chainLocation: 'L1' | 'L2' | 'unknown' | undefined
  registryAddress?: Address | null
}): UseRegistryCardsReturn {
  const parentName = getParentName(name)

  const isL2 = chainLocation === 'L2'
  const isL1 = !isL2 // treat 'unknown' as L1 ancestry for now

  // L1 ancestry via UniversalResolver
  const {
    currentRegistry: l1CurrentRegistry,
    parentRegistry: l1ParentRegistry,
    subregistries: l1Subregistries,
    hasCurrentRegistry: l1HasCurrentRegistry,
    isLoading: isLoadingL1,
    error: l1Error,
  } = useNameSubregistries({ name, enabled: isL1 })

  // L2 ancestry via getNameRegistryAddress
  const {
    currentRegistry: l2CurrentRegistry,
    parentRegistry: l2ParentRegistry,
    subregistries: l2Subregistries,
    hasCurrentRegistry: l2HasCurrentRegistry,
    isLoading: isLoadingL2,
    error: l2Error,
  } = useL2Subregistries({ name, enabled: isL2 })

  // Choose source based on chain location
  const currentRegistry = isL2 ? l2CurrentRegistry : l1CurrentRegistry
  const parentRegistry = isL2 ? l2ParentRegistry : l1ParentRegistry
  const subregistries = (isL2 ? l2Subregistries : l1Subregistries) ?? []
  const hasCurrentRegistry = isL2 ? l2HasCurrentRegistry : l1HasCurrentRegistry

  // Calculate nodes for owner lookups
  const nodeCurrent = namehash(name)
  const nodeParent = parentName
    ? namehash(parentName)
    : ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex)

  // Only fetch owner if we have a valid (non-zero) registry address
  const shouldFetchCurrentOwner =
    !!currentRegistry && currentRegistry !== ZERO_ADDRESS
  const shouldFetchParentOwner =
    !!parentRegistry && parentRegistry !== ZERO_ADDRESS

  const {
    data: currentOwner,
    isLoading: isLoadingCurrentOwner,
    error: currentOwnerError,
  } = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: currentRegistry || ZERO_ADDRESS,
      node: nodeCurrent,
    }),
    enabled: shouldFetchCurrentOwner,
  })

  const {
    data: parentOwner,
    isLoading: isLoadingParentOwner,
    error: parentOwnerError,
  } = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: parentRegistry || ZERO_ADDRESS,
      node: nodeParent,
    }),
    enabled: shouldFetchParentOwner,
  })

  // Build registry cards
  const currentChainId = sepolia.id // TODO: real Namechain ID
  // Later on we need to use the correct chain ID for the current network
  //   const currentChainId  chainLocation === 'L2'
  //       ? Namechain ID
  //       : Mainnet ID

  const current: RegistryCard = {
    registry: currentRegistry,
    owner: (currentOwner as Address) || null,
    chainId: currentChainId,
    hasCurrentRegistry,
  }

  const parent: RegistryCard = {
    registry: parentRegistry,
    owner: (parentOwner as Address) || null,
    chainId: isL2 ? currentChainId : 11155111,
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
