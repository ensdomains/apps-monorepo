import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingMessage } from '@/components/molecules/LoadingMessage'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { columns } from '@/features/forward-resolution/components/ForwardNamesTable/columns'
import { ForwardNamesTable } from '@/features/forward-resolution/components/ForwardNamesTable/ForwardNamesTable'
import { getResolvedNamesForAddressQueryOptions } from '@/features/forward-resolution/components/hooks/useNamesForResolvedAddress'

export const Route = createFileRoute('/addr/$addr/resolution')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  const [sorting, setSorting] = useState<SortingState>([])

  const { data, error, isLoading } = useQuery(
    getResolvedNamesForAddressQueryOptions({
      address,
    }),
  )

  const table = useReactTable({
    data: data || [],
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

  if (error) {
    const message =
      (error.cause as Error | undefined)?.message ||
      (error as Error).message ||
      'Could not load data.'
    return <ErrorMessage title="Data unavailable" description={message} />
  }

  if (!data) {
    return (
      <ErrorMessage
        title="Data unavailable"
        description="Could not load data."
      />
    )
  }

  return (
    <>
      <header className="bg-gray-100 p-6 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">Address Resolution</h1>
        </div>
        <InputGroup className="bg-white rounded-sm">
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
      </header>
      <ForwardNamesTable table={table} />
    </>
  )
}
