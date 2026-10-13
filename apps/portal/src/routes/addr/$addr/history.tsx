import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { AddressHistoryDataTable } from '@/features/address/components/AddressHistoryDataTable'
import {
  ADDRESS_HISTORY_PAGE_SIZE,
  getAddressHeldNamesQueryOptions,
  getAddressHistoryPagesQueryOptions,
  toAddressNameHistory,
} from '@/features/address/hooks/useAddressHistory'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/addr/$addr/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  // Started, not awaited, so the page renders while the first rows load.
  loader: ({ params }) => {
    const address = params.addr as Address
    void queryClient.prefetchInfiniteQuery(
      getAddressHistoryPagesQueryOptions({ address }),
    )
    void queryClient.prefetchQuery(getAddressHeldNamesQueryOptions({ address }))
  },
})

function RouteComponent() {
  const { addr } = Route.useParams() as { addr: Address }

  const pages = useInfiniteQuery(
    getAddressHistoryPagesQueryOptions({ address: addr }),
  )
  const heldNames = useQuery(getAddressHeldNamesQueryOptions({ address: addr }))

  const rows = useMemo(
    () => pages.data?.pages.flatMap((page) => page.rows) ?? [],
    [pages.data],
  )
  const loader = useListLoader({
    initialCount: ADDRESS_HISTORY_PAGE_SIZE,
    loaded: rows.length,
    hasMore: pages.hasNextPage,
    fetchMore: infiniteFetchMore(
      pages.fetchNextPage,
      (page) => page.rows.length,
    ),
    resetKey: addr,
  })
  const history = useMemo(
    () =>
      heldNames.data
        ? toAddressNameHistory(
            addr,
            rows.slice(0, loader.shown),
            heldNames.data,
          )
        : [],
    [addr, rows, loader.shown, heldNames.data],
  )

  if (pages.isLoading || heldNames.isLoading) return <LoadingMessage />

  const error = pages.error ?? heldNames.error
  if (error) {
    return (
      <ErrorMessage
        title="Error loading history"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  return (
    <AddressHistoryDataTable address={addr} history={history} loader={loader} />
  )
}
