import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Address } from 'viem'
import type { SortDir, SortField } from '@/features/dashboard/mergedNames'
import {
  PROFILE_NAMES_PAGE_SIZE,
  type ProfileNamesScope,
  profileNameCountsQueryOptions,
  profileNamesInfiniteQueryOptions,
  toProfileNamesPage,
} from '../service/profileAddressNames'

type Options = {
  readonly address: Address
  readonly scope: ProfileNamesScope
  readonly sortField: SortField
  readonly sortDir: SortDir
  readonly search: string
  /** One-based. */
  readonly page: number
}

/**
 * One page of an address's names, read from bigname in the requested order.
 * More names are read only when a page needs them.
 */
export const useProfileAddressNames = ({
  address,
  scope,
  sortField,
  sortDir,
  search,
  page,
}: Options) => {
  const query = useInfiniteQuery({
    ...profileNamesInfiniteQueryOptions({
      address,
      scope,
      sortField,
      sortDir,
      search: search.trim(),
    }),
    placeholderData: keepPreviousData,
  })
  // Only your own profile splits owned from managed names.
  const { data: counts = null } = useQuery(
    profileNameCountsQueryOptions(scope === 'all' ? undefined : address),
  )

  const current = toProfileNamesPage(
    query.data?.pages ?? [],
    page,
    PROFILE_NAMES_PAGE_SIZE,
  )
  // Until the managed list is read through, its own total still counts the
  // owned names it hides; bigname's managed count is exact.
  const total =
    scope === 'managed' && !current.isComplete && counts
      ? counts.managed
      : current.total

  const isPagePending =
    current.names.length < PROFILE_NAMES_PAGE_SIZE &&
    query.hasNextPage &&
    !query.isError
  const { fetchNextPage, isFetchingNextPage } = query
  useEffect(() => {
    if (isPagePending && !isFetchingNextPage) void fetchNextPage()
  }, [isPagePending, isFetchingNextPage, fetchNextPage])

  return {
    pageNames: current.names,
    total,
    counts: {
      owned: scope === 'owned' ? total : (counts?.owned ?? null),
      managed: scope === 'managed' ? total : (counts?.managed ?? null),
    },
    isPending: query.isPending,
    isPagePending,
    isError: query.isError,
    isPlaceholderData: query.isPlaceholderData,
  }
}
