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
import { getV2NamesWithRolesForAddressQueryOptions } from '@/features/dashboard/hooks/useV2NamesWithRolesForAddress'
import {
  columns,
  type NameRow,
} from '@/features/names/components/NamesTable/columns'
import { NamesTable } from '@/features/names/components/NamesTable/NamesTable'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

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
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  const data = useMemo((): NameRow[] => {
    const v1Names: NameRow[] = (v1NamesQuery.data || []).map(
      ({ name, expiryDate }) => ({
        name,
        expiryDate: expiryDate?.date ?? null,
        roleBitmap: null,
      }),
    )

    const v2Names: NameRow[] = (v2NamesQuery.data || []).map(
      ({ name, expiryDate, roleBitmap }) => ({
        name,
        expiryDate: expiryDate ? new Date(expiryDate * 1000) : null,
        roleBitmap,
      }),
    )

    return [...v1Names, ...v2Names]
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

  if (v1NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (v2NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (v1NamesQuery.error) {
    return (
      <ErrorMessage
        title="Error loading names"
        description={extractErrorMessage(v1NamesQuery.error)}
      />
    )
  }

  if (v2NamesQuery.error) {
    return (
      <ErrorMessage
        title="Error loading names"
        description={extractErrorMessage(v2NamesQuery.error)}
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
