import { useQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Search, XIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { getV1NamesForAddressQueryOptions } from '@/features/dashboard/hooks/useV1NamesForAddress'
import { getV2NamesForAddressQueryOptions } from '@/features/dashboard/hooks/useV2NamesForAddress'
import { columns } from '@/features/names/components/NamesTable/columns'
import { NamesTable } from '@/features/names/components/NamesTable/NamesTable'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { mergeNamesData } from '@/utils/names/mergeNamesData'

export const Route = createFileRoute('/addr/$addr/names')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const [v1NamesQuery, v2NamesQuery] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesForAddressQueryOptions({ address }),
    ],
  })

  const data = useMemo(() => {
    return mergeNamesData(v1NamesQuery.data, v2NamesQuery.data)
  }, [v1NamesQuery.data, v2NamesQuery.data])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
      columnFilters,
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const rowCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection],
  )

  const searchNamesId = useId()

  const queryState = match({ v1: v1NamesQuery, v2: v2NamesQuery })
    .with({ v1: { isLoading: true } }, () => ({ status: 'loading' as const }))
    .with({ v2: { isLoading: true } }, () => ({ status: 'loading' as const }))
    .with({ v1: { error: P.not(P.nullish) } }, ({ v1 }) => ({
      status: 'error' as const,
      error: v1.error,
    }))
    .with({ v2: { error: P.not(P.nullish) } }, ({ v2 }) => ({
      status: 'error' as const,
      error: v2.error,
    }))
    .otherwise(() => ({ status: 'success' as const }))

  if (queryState.status === 'loading') {
    return <LoadingMessage />
  }

  if (queryState.status === 'error') {
    return (
      <ErrorMessage
        title="Error loading names"
        description={extractErrorMessage(queryState.error)}
      />
    )
  }

  const nameCount = data.length

  return (
    <>
      <header className="bg-gray-100 px-8 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">{nameCount} names</h1>
        </div>
        {rowCount > 0 ? (
          <div className="flex flex-col lg:flex-row w-full lg:justify-between lg:items-center gap-4">
            <div className="flex flex-row items-center gap-1 shrink-0">
              <button
                type="button"
                className="cursor-pointer"
                onClick={() => setRowSelection({})}
              >
                <XIcon className="size-6" />
              </button>
              {rowCount} selected
            </div>
          </div>
        ) : (
          <InputGroup className="bg-white rounded-sm">
            <InputGroupInput
              id={searchNamesId}
              className="w-full"
              placeholder="Search names..."
              onChange={(event) => table.setGlobalFilter(event.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
        )}
      </header>
      <div className="overflow-x-auto">
        <NamesTable table={table} />
      </div>
    </>
  )
}
