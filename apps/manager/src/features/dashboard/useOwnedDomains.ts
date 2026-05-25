import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useWallet } from '@getpara/react-sdk-lite'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getAllDomainsInfiniteQuery } from './service/queries/getAllDashboardDomains'

export const useOwnedDomains = () => {
  const { data: wallet } = useWallet()
  const smartAccount = useSmartAccountContextSafe()

  const ownerAddresses = useMemo(() => {
    const candidates = [
      wallet?.address,
      smartAccount?.accountAddress,
      smartAccount?.ownerAddress,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [
    wallet?.address,
    smartAccount?.accountAddress,
    smartAccount?.ownerAddress,
  ])

  const hasOwnerAddresses = ownerAddresses.length > 0

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    getAllDomainsInfiniteQuery(
      hasOwnerAddresses
        ? {
            where: { owner_in: ownerAddresses },
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isError])

  const v2Names: DomainFragment[] = data ?? []

  return {
    v2Names,
    hasOwnerAddresses,
    isPending: isPending && hasOwnerAddresses,
    isError,
  }
}
