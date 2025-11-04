import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { SearchIcon, SquarePen, Trash2Icon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { Address } from 'viem'
import { Input } from "@/components/ui/input"
import { Button } from '@/components/ui/button'
import { columns } from '@/features/reverse-resolution/components/ReverseResolutionTable/columns'
import { ReverseResolutionTable } from '@/features/reverse-resolution/components/ReverseResolutionTable/ReverseResolutionTable'
import { REVERSE_RESOLUTION_NETWORKS } from '@/features/reverse-resolution/config'
import { getReverseResolutionQueryOptions } from '@/features/reverse-resolution/hooks/useReverseResolution'

export const Route = createFileRoute('/addr/$addr/reverse-resolution')({
  component: RouteComponent,
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const { data, error, isLoading } = useQuery(
    getReverseResolutionQueryOptions({
      address,
      networks: REVERSE_RESOLUTION_NETWORKS,
    }),
  )

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const searchId = useId()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.cause?.message}</div>

  if (!data) return <div>No data</div>

  const selectedRowsCount = table.getFilteredSelectedRowModel().rows.length

  const handleClearSelection = () => {
    table.resetRowSelection()
  }

  const handleEdit = () => {
    // TODO: Implement edit action
    console.log('Edit selected rows:', table.getSelectedRowModel().rows)
  }

  const handleClear = () => {
    // TODO: Implement clear action
    console.log('Clear selected rows:', table.getSelectedRowModel().rows)
  }

  return (
    <>
      <header className="bg-gray-100 p-6 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">Reverse resolution</h1>
        </div>
        <div className="flex flex-row gap-2 w-full bg-white rounded-sm p-2 h-10">
          <label htmlFor={searchId} aria-label="Search resolution">
            <SearchIcon />
          </label>
          <Input
            id={searchId}
            className="w-full"
            placeholder="Search..."
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
        </div>
        {selectedRowsCount > 0 && (
          <div className="flex flex-row justify-between items-center">
            <div className="flex flex-row items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="flex items-center gap-2"
              >
                <XIcon className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium">
                {selectedRowsCount} selected
              </span>
            </div>
            <div className="flex flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="flex items-center gap-2"
              >
                <SquarePen className="w-4 h-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="flex items-center gap-2"
              >
                <Trash2Icon className="w-4 h-4" />
                Clear
              </Button>
            </div>
          </div>
        )}
      </header>
      <ReverseResolutionTable table={table} address={address} />
    </>
  )
}
