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
import {
  getResolvedNamesForAddressQueryOptions,
  RESOLVED_NAMES_PAGE_SIZE,
} from '@/features/forward-resolution/components/hooks/useNamesForResolvedAddress'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'

// Stable identity: a fresh `[]` each render makes the table recompute its row
// model, which auto-resets the page index and re-renders.
const NO_ROWS: never[] = []

export const Route = createFileRoute('/addr/$addr/resolution')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  // Started, not awaited, so the page renders while the first names load.
  loader: ({ params }) => {
    void queryClient.prefetchInfiniteQuery(
      getResolvedNamesForAddressQueryOptions({
        address: params.addr as Address,
      }),
    )
  },
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  const [sorting, setSorting] = useState<SortingState>([])

  const query = useInfiniteQuery(
    getResolvedNamesForAddressQueryOptions({ address }),
  )
  const loaded = useMemo(
    () => query.data?.pages.flatMap((page) => page.names) ?? NO_ROWS,
    [query.data],
  )
  const loader = useListLoader({
    initialCount: RESOLVED_NAMES_PAGE_SIZE,
    loaded: loaded.length,
    hasMore: query.hasNextPage,
    fetchMore: infiniteFetchMore(
      query.fetchNextPage,
      (page) => page.names.length,
    ),
    resetKey: address,
  })
  const data = useMemo(
    () => loaded.slice(0, loader.shown),
    [loaded, loader.shown],
  )
  const isEthereumOnly = query.data?.pages[0]?.isEthereumOnly ?? false

  const table = useReactTable({
    data,
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

  if (query.isLoading) return <LoadingMessage />

  // A failed Load more keeps the rows; the loader says it failed.
  if (query.error && !query.isFetchNextPageError) {
    return (
      <ErrorMessage
        title="Data unavailable"
        description={extractErrorMessage(query.error)}
      />
    )
  }

  if (data.length === 0) {
    return (
      <>
        <header className="flex flex-col gap-4">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Address Resolution
          </PageHeading>
        </header>
        <NoResultsMessage
          title="No names found"
          description="No ENS name has an address record on an EVM network that points at this address."
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
        {isEthereumOnly && (
          <p className="text-sm text-muted-foreground">
            One of these names stores this address under more networks than can
            be listed, so only Ethereum address records are matched.
          </p>
        )}
      </header>
      <ForwardNamesTable table={table} />
      <ListLoader {...loader} className="py-4" />
    </>
  )
}
