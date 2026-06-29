import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { Address } from 'viem'
import {
  buildMergedNamesList,
  type MergedItem,
  type SortDir,
  type SortField,
} from '@/features/dashboard/mergedNames'
import { getAllDomainsInfiniteQuery } from '@/features/dashboard/service/queries/getAllDashboardDomains'
import { profileV1NamesQuery } from '@/features/profile/service/profileV1Names'

type UseAddressNamesOptions = {
  readonly searchQuery?: string
  readonly sortField?: SortField
  readonly sortDir?: SortDir
}

type UseAddressNamesResult = {
  readonly items: MergedItem[]
  readonly totalCount: number
  readonly isPending: boolean
  readonly isError: boolean
}

/**
 * Fetches and merges the v1 and v2 ENS names associated with an arbitrary
 * address for the address profile view. v2 names come from the indexer
 * (all pages), v1 names from the v1 subgraph. The merged, sorted list reuses
 * the dashboard's `buildMergedNamesList` so v1/v2 names are labeled and
 * ordered consistently across the app.
 */
export const useAddressNames = (
  address?: Address,
  {
    searchQuery = '',
    sortField = 'name',
    sortDir = 'asc',
  }: UseAddressNamesOptions = {},
): UseAddressNamesResult => {
  const owner = address?.toLowerCase()

  const {
    data: v2Pages,
    isPending: isV2Pending,
    isError: isV2Error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    getAllDomainsInfiniteQuery(
      owner
        ? {
            where: { owner },
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

  // Eagerly load all pages so the merged list is complete and paginated
  // client-side, mirroring the dashboard behaviour.
  useEffect(() => {
    if (isV2Error || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isV2Error])

  const {
    data: v1Classified,
    isPending: isV1Pending,
    isError: isV1Error,
  } = useQuery(profileV1NamesQuery(address))

  const v2Names: readonly DomainFragment[] = v2Pages ?? []

  const items = useMemo(
    () =>
      buildMergedNamesList({
        v2Names,
        v1Classified: v1Classified ?? [],
        searchQuery,
        sortField,
        sortDir,
      }),
    [v2Names, v1Classified, searchQuery, sortField, sortDir],
  )

  const isV2Loading = Boolean(owner) && (isV2Pending || hasNextPage)
  const isV1Loading = Boolean(owner) && isV1Pending

  return {
    items,
    totalCount: items.length,
    isPending: isV2Loading || isV1Loading,
    isError: isV2Error || isV1Error,
  }
}
