import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getAllDomainsInfiniteQuery } from './service/queries/getAllDashboardDomains'

export const useOwnedDomains = () => {
  const { address } = useAccount()
  const smartAccount = useSmartAccountContextSafe()

  const ownerAddresses = useMemo(() => {
    const candidates = [
      address,
      smartAccount?.accountAddress,
      smartAccount?.ownerAddress,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [address, smartAccount?.accountAddress, smartAccount?.ownerAddress])

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

  const isAllPagesLoaded =
    !hasOwnerAddresses || (!isPending && !isFetchingNextPage && !hasNextPage)

  return {
    v2Names,
    hasOwnerAddresses,
    isPending: isPending && hasOwnerAddresses,
    isError,
    isAllPagesLoaded,
  }
}
