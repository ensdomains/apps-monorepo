import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { SearchIcon, XIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { columns } from '@/features/forward-resolution/components/ForwardNamesTable/columns'
import { ForwardNamesTable } from '@/features/forward-resolution/components/ForwardNamesTable/ForwardNamesTable'

export const Route = createFileRoute('/addr/$addr/forward')({
  component: RouteComponent,
})

function RouteComponent() {
  const { addr } = Route.useParams() as { addr: Address }

  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: [],
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

  return (
    <>
      <header className="bg-gray-100 p-6 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">Reverse Resolution</h1>
        </div>
        <div className="flex flex-row gap-2 w-full bg-white  rounded-sm p-2 h-10">
          <label htmlFor={searchNamesId} aria-label="Search records">
            <SearchIcon />
          </label>
          <input
            id={searchNamesId}
            className="w-full "
            placeholder="Search records..."
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
        </div>
      </header>
      <ForwardNamesTable table={table} />
    </>
  )
}
