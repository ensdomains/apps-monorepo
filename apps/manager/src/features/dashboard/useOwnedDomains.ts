import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getAllDomainsInfiniteQuery } from './service/queries/getAllDashboardDomains'
import { getDashboardRoleAssignmentsQuery } from './service/queries/getDashboardRoleAssignments'
import { applyV2RoleAssignments } from './v2NameRoles'

const SMART_ACCOUNT_WAIT_MS = 5_000

export const useOwnedDomains = () => {
  const { address } = useConnection()
  const smartAccount = useSmartAccountContextSafe()
  const [timedOutAddress, setTimedOutAddress] = useState<string | null>(null)
  const normalizedWalletAddress = address?.toLowerCase()
  const hasSmartAccountContext = smartAccount !== null
  const smartAccountError = smartAccount?.error
  const accountReady =
    !!normalizedWalletAddress &&
    smartAccount?.isAccountReady === true &&
    smartAccount.accountAddress != null &&
    smartAccount.ownerAddress?.toLowerCase() === normalizedWalletAddress

  // The wallet address arrives before HCA initialization. Give it a bounded
  // window to finish so the first list request uses the final owner set.
  useEffect(() => {
    if (
      !normalizedWalletAddress ||
      !hasSmartAccountContext ||
      accountReady ||
      smartAccountError
    ) {
      return
    }
    const timeout = setTimeout(
      () => setTimedOutAddress(normalizedWalletAddress),
      SMART_ACCOUNT_WAIT_MS,
    )
    return () => clearTimeout(timeout)
  }, [
    normalizedWalletAddress,
    hasSmartAccountContext,
    accountReady,
    smartAccountError,
  ])

  useEffect(() => {
    if (accountReady) setTimedOutAddress(null)
  }, [accountReady])

  const canFetch =
    !!normalizedWalletAddress &&
    (!hasSmartAccountContext ||
      accountReady ||
      !!smartAccountError ||
      timedOutAddress === normalizedWalletAddress)

  const ownerAddresses = useMemo(() => {
    if (!canFetch) return []
    const candidates = [
      address,
      accountReady ? smartAccount?.accountAddress : null,
      accountReady ? smartAccount?.ownerAddress : null,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [
    address,
    smartAccount?.accountAddress,
    smartAccount?.ownerAddress,
    accountReady,
    canFetch,
  ])

  const hasOwnerAddresses = !!normalizedWalletAddress

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery(
    getAllDomainsInfiniteQuery(
      canFetch
        ? {
            where: { owner_in: ownerAddresses },
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

  const roleAssignmentsQuery = useQuery(
    getDashboardRoleAssignmentsQuery(canFetch ? ownerAddresses : undefined),
  )

  useEffect(() => {
    if (!canFetch || isError || !hasNextPage || isFetching) return
    void fetchNextPage({ cancelRefetch: false })
  }, [fetchNextPage, hasNextPage, isFetching, isError, canFetch])

  const v2Names = useMemo(
    () => applyV2RoleAssignments(data ?? [], roleAssignmentsQuery.data ?? []),
    [data, roleAssignmentsQuery.data],
  )

  const isRoleAssignmentsPending =
    hasOwnerAddresses && roleAssignmentsQuery.isPending

  const isDomainScanComplete =
    canFetch && !isPending && !isFetchingNextPage && !hasNextPage

  const isAllPagesLoaded =
    !hasOwnerAddresses || (isDomainScanComplete && !isRoleAssignmentsPending)

  return {
    v2Names,
    hasOwnerAddresses,
    isPending:
      (hasOwnerAddresses && (!canFetch || isPending)) ||
      isRoleAssignmentsPending,
    isError: isError || roleAssignmentsQuery.isError === true,
    isAllPagesLoaded,
    isDomainScanComplete,
  }
}

export type OwnedDomainsResult = ReturnType<typeof useOwnedDomains>
