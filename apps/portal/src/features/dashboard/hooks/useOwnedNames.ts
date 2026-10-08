import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import type { FetchMoreResult } from '@/components/ListLoader/fetchUntil'
import type { V2NameWithRoles } from '@/utils/names/mergeNamesData'
import { settleOwnedNames } from '../utils/settleOwnedNames'
import { getV1NamesPagesForAddressQueryOptions } from './useV1NamesForAddress'
import { getV2NamesPagesForAddressQueryOptions } from './useV2NamesWithRolesForAddress'

type NamesPagesQuery<TName> = {
  readonly data?: { readonly pages: readonly NamesPage<TName>[] }
  readonly hasNextPage: boolean
}

type NamesPage<TName> = { readonly names: readonly TName[] }

type FetchableNamesPagesQuery<TName> = NamesPagesQuery<TName> & {
  readonly fetchNextPage: () => Promise<
    FetchableNamesPagesQuery<TName> & {
      readonly isError: boolean
      readonly error: unknown
    }
  >
}

type OwnedNamesQueries = {
  readonly v1: FetchableNamesPagesQuery<NameWithRelation>
  readonly v2: FetchableNamesPagesQuery<V2NameWithRoles>
}

const toSource = <TName>({ data, hasNextPage }: NamesPagesQuery<TName>) => ({
  names: data?.pages.flatMap((page) => page.names) ?? [],
  hasMore: hasNextPage,
})

const fetchNextNamesPage = async <TName>(
  query: FetchableNamesPagesQuery<TName>,
): Promise<FetchableNamesPagesQuery<TName>> => {
  if (!query.hasNextPage) return query
  const next = await query.fetchNextPage()
  if (next.isError) throw next.error
  return next
}

const countLoaded = ({ v1, v2 }: OwnedNamesQueries) =>
  toSource(v1).names.length + toSource(v2).names.length

const countSettled = ({ v1, v2 }: OwnedNamesQueries) =>
  settleOwnedNames({ v1: toSource(v1), v2: toSource(v2) }).length

/** Fetches pages until one settles more names, the sources end, a page comes back empty, or it is aborted. */
const fetchMoreSettledNames = async (
  queries: OwnedNamesQueries,
  signal?: AbortSignal,
): Promise<FetchMoreResult> => {
  const [v1, v2] = await Promise.all([
    fetchNextNamesPage(queries.v1),
    fetchNextNamesPage(queries.v2),
  ])
  const next = { v1, v2 }
  const hasMore = v1.hasNextPage || v2.hasNextPage
  const isWaitingOnLaterPages =
    hasMore &&
    !signal?.aborted &&
    countSettled(next) === countSettled(queries) &&
    countLoaded(next) > countLoaded(queries)

  return isWaitingOnLaterPages
    ? fetchMoreSettledNames(next, signal)
    : { loaded: countSettled(next), hasMore }
}

/** Keeps the last results up while a new search for the same address loads. */
export const keepPreviousSearch =
  (address: Address) =>
  <TData>(
    previousData: TData | undefined,
    previousQuery:
      | { readonly queryKey: readonly [unknown, { address?: Address }?] }
      | undefined,
  ) =>
    previousQuery?.queryKey[1]?.address === address ? previousData : undefined

/** The names an address owns across ENSv1 and ENSv2, soonest expiry first, loaded in pages. */
export const useOwnedNames = ({
  address,
  search,
  enabled = true,
}: {
  readonly address: Address
  readonly search?: string
  readonly enabled?: boolean
}) => {
  const v1Query = useInfiniteQuery({
    ...getV1NamesPagesForAddressQueryOptions({ address, search }),
    enabled,
    placeholderData: keepPreviousSearch(address),
  })
  const v2Query = useInfiniteQuery({
    ...getV2NamesPagesForAddressQueryOptions({ address, search }),
    enabled,
    placeholderData: keepPreviousSearch(address),
  })

  const names = useMemo(
    () =>
      settleOwnedNames({
        v1: toSource({ data: v1Query.data, hasNextPage: v1Query.hasNextPage }),
        v2: toSource({ data: v2Query.data, hasNextPage: v2Query.hasNextPage }),
      }),
    [v1Query.data, v1Query.hasNextPage, v2Query.data, v2Query.hasNextPage],
  )

  const v2Total = v2Query.data?.pages.at(-1)?.totalCount

  return {
    names,
    // ENSv1 has no total, so the count is only known once its last page is in.
    total:
      v1Query.hasNextPage || !v1Query.data || v2Total === undefined
        ? undefined
        : toSource(v1Query).names.length + v2Total,
    hasMore: v1Query.hasNextPage || v2Query.hasNextPage,
    fetchMore: (signal?: AbortSignal) =>
      fetchMoreSettledNames({ v1: v1Query, v2: v2Query }, signal),
    v1Query,
    v2Query,
  }
}
