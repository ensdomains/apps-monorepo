import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, getAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getRecentlyMigratedNames } from '@/features/migration/service/recentlyMigratedNames'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import {
  type AddressNamesChunk,
  type DashboardName,
  isAwaitingMigratedNames,
  mergeDashboardChunks,
  type NameVersion,
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

// A just-migrated name is listed as ENSv1 until bigname indexes the migration.
const MIGRATED_NAME_POLL_MS = 3_000

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
  readonly version?: NameVersion | null
  /** One-based. Omit for callers that only need counts from the initial read. */
  readonly page?: number
}

const getDashboardPageReadQueryOptions = ({
  namesKey,
  chunkCount,
  shouldRead,
  fetchNextPage,
}: {
  readonly namesKey: readonly unknown[]
  readonly chunkCount: number
  readonly shouldRead: boolean
  readonly fetchNextPage: () => Promise<unknown>
}) =>
  queryOptions({
    queryKey: qk('dashboard', 'read_next_chunk', { namesKey, chunkCount }),
    queryFn: async () => {
      await fetchNextPage()
      return null
    },
    enabled: shouldRead,
    gcTime: 0,
  })

/** One page of the dashboard; more of each address's names are read only when a page needs them. */
export const useDashboardNames = ({
  sortField = 'name',
  sortDir = 'asc',
  search = '',
  version = null,
  page,
}: Options = {}) => {
  const addresses = useDashboardAddresses()
  const { address } = useConnection()
  const smartAccount = useSmartAccountContextSafe()
  const recordEditorAddress = smartAccount?.ownerAddress ?? address
  const queryClient = useQueryClient()
  const hasAddresses = addresses.length > 0
  const namesOptions = getDashboardNamesInfiniteQueryOptions(
    {
      addresses,
      sortField,
      sortDir,
      search: search.trim(),
      version,
      recordEditorAddress,
    },
    queryClient,
  )
  const query = useInfiniteQuery({
    ...namesOptions,
    refetchInterval: ({ state }) =>
      isAwaitingMigratedNames(
        state.data?.pages.flat() ?? [],
        getRecentlyMigratedNames().filter((name) =>
          name.toLowerCase().includes(search.trim().toLowerCase()),
        ),
        version,
      )
        ? MIGRATED_NAME_POLL_MS
        : false,
  })
  const grace = useQuery(getDashboardGraceNamesQueryOptions(addresses))

  const searchLower = search.trim().toLowerCase()
  // Names in grace are ENSv2 only.
  const graceNames = useMemo(
    () =>
      version === 'v1'
        ? NO_NAMES
        : (grace.data ?? NO_NAMES).filter((name) =>
            name.name.includes(searchLower),
          ),
    [grace.data, searchLower, version],
  )
  const merged = useMemo(
    () => mergePages(query.data?.pages, graceNames, sortField, sortDir),
    [query.data, graceNames, sortField, sortDir],
  )

  const { names: pageNames, needed } = toDashboardPage(
    merged,
    page ?? 1,
    DASHBOARD_PAGE_SIZE,
  )
  const needsMore =
    merged.names.length < needed && query.hasNextPage && !query.isError

  // Reassess the current page after each read, including after URL navigation.
  useQuery(
    getDashboardPageReadQueryOptions({
      namesKey: namesOptions.queryKey,
      chunkCount: query.data?.pages.length ?? 0,
      shouldRead: page !== undefined && needsMore && !query.isFetching,
      fetchNextPage: () => query.fetchNextPage({ cancelRefetch: false }),
    }),
  )

  return {
    addresses,
    hasAddresses,
    pageNames,
    total: merged.total,
    isComplete: merged.isComplete,
    isPending: hasAddresses && query.isPending,
    isPagePending: needsMore,
    isError: query.isError,
    isGraceError: grace.isError,
  }
}
