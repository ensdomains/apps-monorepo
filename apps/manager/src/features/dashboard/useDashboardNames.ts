import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { type Address, getAddress } from 'viem'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import {
  type DashboardName,
  mergeDashboardChunks,
  type SortDir,
  type SortField,
  toDashboardPage,
} from './dashboardNames'
import {
  getDashboardGraceNamesQueryOptions,
  getDashboardNamesInfiniteQueryOptions,
} from './service/queries/getDashboardNames'

export const DASHBOARD_PAGE_SIZE = 5

const NO_NAMES: readonly DashboardName[] = []

/** The connected wallet, its smart account and that account's owner. */
export const useDashboardAddresses = (): readonly Address[] => {
  const { address } = useConnection()
  const smartAccount = useSmartAccountContextSafe()
  return useMemo(
    () =>
      Array.from(
        new Set(
          [address, smartAccount?.accountAddress, smartAccount?.ownerAddress]
            .filter((candidate): candidate is Address => !!candidate)
            .map((candidate) => getAddress(candidate)),
        ),
      ),
    [address, smartAccount?.accountAddress, smartAccount?.ownerAddress],
  )
}

export const useDashboardGraceNames = () => {
  const addresses = useDashboardAddresses()
  const { data } = useQuery(getDashboardGraceNamesQueryOptions(addresses))
  return data ?? NO_NAMES
}

type Options = {
  readonly sortField?: SortField
  readonly sortDir?: SortDir
  readonly search?: string
  /** One-based. */
  readonly page?: number
}

/** One page of the dashboard; more of each address's names are read only when a page needs them. */
export const useDashboardNames = ({
  sortField = 'name',
  sortDir = 'asc',
  search = '',
  page = 1,
}: Options = {}) => {
  const addresses = useDashboardAddresses()
  const hasAddresses = addresses.length > 0
  const query = useInfiniteQuery(
    getDashboardNamesInfiniteQueryOptions({
      addresses,
      sortField,
      sortDir,
      search: search.trim(),
    }),
  )
  const grace = useQuery(getDashboardGraceNamesQueryOptions(addresses))

  const searchLower = search.trim().toLowerCase()
  const merged = useMemo(
    () =>
      mergeDashboardChunks({
        chunks: query.data?.pages.flat() ?? [],
        graceNames: (grace.data ?? NO_NAMES).filter((name) =>
          name.name.includes(searchLower),
        ),
        field: sortField,
        dir: sortDir,
      }),
    [query.data, grace.data, searchLower, sortField, sortDir],
  )

  const { names: pageNames, needed } = toDashboardPage(
    merged,
    page,
    DASHBOARD_PAGE_SIZE,
  )
  const needsMore =
    merged.names.length < needed && query.hasNextPage && !query.isError
  const { fetchNextPage, isFetchingNextPage } = query
  useEffect(() => {
    if (needsMore && !isFetchingNextPage) void fetchNextPage()
  }, [needsMore, isFetchingNextPage, fetchNextPage])

  return {
    addresses,
    hasAddresses,
    pageNames,
    total: merged.total,
    isPending: hasAddresses && query.isPending,
    isPagePending: needsMore,
    isError: query.isError,
    isGraceError: grace.isError,
  }
}
