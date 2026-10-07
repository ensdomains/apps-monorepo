import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import type { FetchMoreResult } from '@/components/ListLoader/fetchUntil'
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
    NamesPagesQuery<TName> & {
      readonly isError: boolean
      readonly error: unknown
    }
  >
}

const toSource = <TName>({ data, hasNextPage }: NamesPagesQuery<TName>) => ({
  names: data?.pages.flatMap((page) => page.names) ?? [],
  hasMore: hasNextPage,
})

const fetchNextNamesPage = async <TName>(
  query: FetchableNamesPagesQuery<TName>,
): Promise<NamesPagesQuery<TName>> => {
  if (!query.hasNextPage) return query
  const next = await query.fetchNextPage()
  if (next.isError) throw next.error
  return next
}

/** The names an address owns across ENSv1 and ENSv2, soonest expiry first, loaded in pages. */
export const useOwnedNames = ({
  address,
  enabled = true,
}: {
  readonly address: Address
  readonly enabled?: boolean
}) => {
  const v1Query = useInfiniteQuery({
    ...getV1NamesPagesForAddressQueryOptions({ address }),
    enabled,
  })
  const v2Query = useInfiniteQuery({
    ...getV2NamesPagesForAddressQueryOptions({ address }),
    enabled,
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
    fetchMore: async (): Promise<FetchMoreResult> => {
      const [v1Next, v2Next] = await Promise.all([
        fetchNextNamesPage(v1Query),
        fetchNextNamesPage(v2Query),
      ])
      return {
        loaded: settleOwnedNames({
          v1: toSource(v1Next),
          v2: toSource(v2Next),
        }).length,
        hasMore: v1Next.hasNextPage || v2Next.hasNextPage,
      }
    },
    v1Query,
    v2Query,
  }
}
