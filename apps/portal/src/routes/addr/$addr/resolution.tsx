import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { columns } from '@/features/forward-resolution/components/ForwardNamesTable/columns'
import { ForwardNamesTable } from '@/features/forward-resolution/components/ForwardNamesTable/ForwardNamesTable'
import { getResolvedNamesForAddressQueryOptions } from '@/features/forward-resolution/components/hooks/useNamesForResolvedAddress'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'

const RESOLVED_NAMES_INITIAL_COUNT = 100

export const Route = createFileRoute('/addr/$addr/resolution')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchInfiniteQuery(
      getResolvedNamesForAddressQueryOptions({
        address: params.addr as Address,
      }),
    ),
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  const [sorting, setSorting] = useState<SortingState>([])

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery(getResolvedNamesForAddressQueryOptions({ address }))

  const loadedNames = useMemo(
    () => data?.pages.flatMap((page) => page.names) ?? [],
    [data],
  )

  const loader = useListLoader({
    initialCount: RESOLVED_NAMES_INITIAL_COUNT,
    loaded: loadedNames.length,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.names.length),
    resetKey: address,
  })

  // Memoised: a fresh array makes the table recompute its row model and re-render.
  const names = useMemo(
    () => loadedNames.slice(0, loader.shown),
    [loadedNames, loader.shown],
  )

  const table = useReactTable({
    data: names,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const searchNamesId = useId()

  if (isLoading) return <LoadingMessage />

  if (error && !isFetchNextPageError) {
    return (
      <ErrorMessage
        title="Data unavailable"
        description={extractErrorMessage(error)}
      />
    )
  }

  if (loadedNames.length === 0) {
    return (
      <>
        <header className="flex flex-col gap-4">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Address Resolution
          </PageHeading>
        </header>
        <NoResultsMessage
          title="No names found"
          description="This address doesn't resolve to any ENS names yet."
          className="mx-0"
        />
      </>
    )
  }

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Address Resolution
          </PageHeading>
        </div>
        <InputGroup className="bg-background rounded-sm">
          <InputGroupInput
            id={searchNamesId}
            className="w-full"
            placeholder="Search..."
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        {loader.canShowMore && Boolean(table.getState().globalFilter) && (
          <p className="text-p text-muted-foreground">
            Search covers the {names.length} names shown so far. Show more to
            include the rest.
          </p>
        )}
      </header>
      <ForwardNamesTable table={table} />
      <ListLoader {...loader} className="py-4" />
    </>
  )
}
