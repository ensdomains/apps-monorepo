import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, getAddress } from 'viem'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import {
  type AddressNamesChunk,
  type DashboardName,
  mergeDashboardChunks,
  type SortDir,
  type SortField,
  toDashboardPage,
} from './dashboardNames'
import {
  DASHBOARD_PAGE_SIZE,
  getDashboardGraceNamesQueryOptions,
  getDashboardNamesInfiniteQueryOptions,
} from './service/queries/getDashboardNames'

export { DASHBOARD_PAGE_SIZE }

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

const mergePages = (
  pages: readonly (readonly AddressNamesChunk[])[] = [],
  graceNames: readonly DashboardName[],
  field: SortField,
  dir: SortDir,
) => mergeDashboardChunks({ chunks: pages.flat(), graceNames, field, dir })

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
  const graceNames = useMemo(
    () =>
      (grace.data ?? NO_NAMES).filter((name) =>
        name.name.includes(searchLower),
      ),
    [grace.data, searchLower],
  )
  const merged = useMemo(
    () => mergePages(query.data?.pages, graceNames, sortField, sortDir),
    [query.data, graceNames, sortField, sortDir],
  )

  const { names: pageNames, needed } = toDashboardPage(
    merged,
    page,
    DASHBOARD_PAGE_SIZE,
  )
  const needsMore =
    merged.names.length < needed && query.hasNextPage && !query.isError

  const isShortOf = (target: number, data: typeof query.data) => {
    const loaded = mergePages(data?.pages, graceNames, sortField, sortDir)
    return (
      loaded.names.length <
      toDashboardPage(loaded, target, DASHBOARD_PAGE_SIZE).needed
    )
  }
  /** Reads on until a page is filled; called when moving to that page. */
  const loadPage = async (target: number) => {
    let result: Pick<typeof query, 'data' | 'hasNextPage' | 'isError'> = query
    while (
      result.hasNextPage &&
      !result.isError &&
      isShortOf(target, result.data)
    ) {
      result = await query.fetchNextPage({ cancelRefetch: false })
    }
  }

  return {
    addresses,
    hasAddresses,
    pageNames,
    total: merged.total,
    isPending: hasAddresses && query.isPending,
    isPagePending: needsMore,
    loadPage,
    isError: query.isError,
    isGraceError: grace.isError,
  }
}
