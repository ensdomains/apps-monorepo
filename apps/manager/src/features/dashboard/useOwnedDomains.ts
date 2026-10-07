import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useConnection } from 'wagmi'
import {
  clearRecentlyMigratedNames,
  getRecentlyMigratedNames,
} from '@/features/migration/service/recentlyMigratedNames'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getAllDomainsInfiniteQuery } from './service/queries/getAllDashboardDomains'
import { getDashboardRoleAssignmentsQuery } from './service/queries/getDashboardRoleAssignments'
import { resolveDomainLabel } from './utils'
import { applyV2RoleAssignments } from './v2NameRoles'

/**
 * How often to ask the indexer again for a name the user just migrated. Two
 * orchestrator-free reads, and the wait is only a few seconds in practice.
 */
const MIGRATED_NAME_POLL_MS = 3_000

const toComparableName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\.eth$/, '')

/** The just-migrated names the indexer has not handed back yet. */
const getMissingMigratedNames = (
  migratedNames: readonly string[],
  domains: readonly { readonly id: string; readonly name?: string | null }[],
): readonly string[] => {
  if (migratedNames.length === 0) return []

  const present = new Set(
    domains.map((domain) => toComparableName(resolveDomainLabel(domain))),
  )

  return migratedNames.filter((name) => !present.has(toComparableName(name)))
}

export const useOwnedDomains = () => {
  const { address } = useConnection()
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
  } = useInfiniteQuery({
    ...getAllDomainsInfiniteQuery(
      hasOwnerAddresses
        ? {
            where: { owner_in: ownerAddresses },
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
    // Decided from the query's own data: the names it is waiting for are the
    // ones that tell it whether to ask again.
    refetchInterval: (query) => {
      const domains =
        query.state.data?.pages.flatMap((page) => page.domains) ?? []
      const missing = getMissingMigratedNames(
        getRecentlyMigratedNames(),
        domains,
      )
      return missing.length > 0 ? MIGRATED_NAME_POLL_MS : false
    },
  })

  const roleAssignmentsQuery = useQuery(
    getDashboardRoleAssignmentsQuery(
      hasOwnerAddresses ? ownerAddresses : undefined,
    ),
  )

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isError])

  const v2Names = useMemo(
    () => applyV2RoleAssignments(data ?? [], roleAssignmentsQuery.data ?? []),
    [data, roleAssignmentsQuery.data],
  )

  // A name that has just migrated has already left the V1 subgraph, so until
  // the V2 indexer has it the dashboard would simply be missing it.
  const missingMigratedNames = getMissingMigratedNames(
    getRecentlyMigratedNames(),
    data ?? [],
  )
  const hasMissingMigratedNames = missingMigratedNames.length > 0

  useEffect(() => {
    if (!isPending && !hasMissingMigratedNames) clearRecentlyMigratedNames()
  }, [isPending, hasMissingMigratedNames])

  const isRoleAssignmentsPending =
    hasOwnerAddresses && roleAssignmentsQuery.isPending

  const isAllPagesLoaded =
    !hasOwnerAddresses ||
    (!isPending &&
      !isFetchingNextPage &&
      !hasNextPage &&
      !isRoleAssignmentsPending)

  return {
    v2Names,
    hasOwnerAddresses,
    isPending: (isPending && hasOwnerAddresses) || isRoleAssignmentsPending,
    isError: isError || roleAssignmentsQuery.isError === true,
    isAllPagesLoaded,
  }
}
