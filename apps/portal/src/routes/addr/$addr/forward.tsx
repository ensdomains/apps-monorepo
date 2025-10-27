import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { SearchIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { Address } from 'viem'
import { columns } from '@/features/forward-resolution/components/ForwardNamesTable/columns'
import { ForwardNamesTable } from '@/features/forward-resolution/components/ForwardNamesTable/ForwardNamesTable'
import { getResolvedNamesForAddressQueryOptions } from '@/features/forward-resolution/components/hooks/useNamesForResolvedAddress'

export const Route = createFileRoute('/addr/$addr/forward')({
  component: RouteComponent,
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

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

  const { data, error, isLoading } = useQuery(
    getResolvedNamesForAddressQueryOptions({
      address,
    }),
  )

  if (isLoading) return <div>Loading</div>
  if (error) return <div>{error.message}</div>
  if (data) return <div>{JSON.stringify(data)}</div>

  return (
    <>
      <header className="bg-gray-100 p-6 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">Forward Resolution</h1>
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
