import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { isZeroAddress, ZERO_ADDRESS } from '@/lib/utils'
import { splitLabels } from '../utils/nameUtils'
import { getRegistryOwnerQueryOptions } from './useRegistryOwner'

export function useRegistryOwners({
  name,
  currentRegistry,
  parentRegistry,
  enabled = true,
}: {
  name: string
  currentRegistry: Address | null
  parentRegistry: Address | null
  enabled?: boolean
}) {
  const labels = splitLabels(name)
  const currentLabel = labels[0]
  const parentLabel = labels[1]

  const shouldFetchCurrent =
    enabled && !isZeroAddress(currentRegistry) && !!currentLabel

  const shouldFetchParent =
    enabled && !isZeroAddress(parentRegistry) && !!parentLabel

  const currentOwnerQ = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: currentRegistry ?? ZERO_ADDRESS,
      label: currentLabel ?? '',
    }),
    enabled: shouldFetchCurrent,
    placeholderData: (prev) => prev,
  })

  const parentOwnerQ = useQuery({
    ...getRegistryOwnerQueryOptions({
      registryAddress: parentRegistry ?? ZERO_ADDRESS,
      label: parentLabel ?? '',
    }),
    enabled: shouldFetchParent,
    placeholderData: (prev) => prev,
  })

  return {
    currentOwner: (currentOwnerQ.data as Address) ?? null,
    parentOwner: (parentOwnerQ.data as Address) ?? null,
    isLoading: currentOwnerQ.isLoading || parentOwnerQ.isLoading,
    error: (currentOwnerQ.error || parentOwnerQ.error) as Error | null,
  }
}
