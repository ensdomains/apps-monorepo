import { Link } from '@tanstack/react-router'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, Search } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export interface SubnameRow {
  readonly name: string
  readonly owner: Address
}

const SortButton = ({ children, ...props }: React.ComponentProps<'button'>) => (
  <button
    className="p-0 flex flex-row items-center cursor-pointer"
    type="button"
    {...props}
  >
    {children}
    <ArrowUpDown className="ml-2 h-4 w-4" />
  </button>
)

const columns: ColumnDef<SubnameRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Subname
      </SortButton>
    ),
    cell: ({ row }) => {
      const name = row.original.name

      return (
        <div className="flex flex-row gap-2 items-center">
          <NameAvatar
            name={name}
            height="40px"
            width="40px"
            rounded="rounded-sm"
          />
          <CopyableRecord href={`/${name}`} value={name} />
        </div>
      )
    },
  },
  {
    accessorKey: 'owner',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Owner
      </SortButton>
    ),
    cell: ({ row }) => {
      const owner = row.original.owner

      return (
        <div className="flex flex-row gap-2 items-center">
          <NameAvatar
            name={owner}
            height="40px"
            width="40px"
            rounded="rounded-sm"
          />
          <CopyableRecord href={`/addr/${owner}`} value={owner} />
        </div>
      )
    },
  },
]

interface SubnamesTableProps {
  readonly subnames: readonly SubnameRow[]
}

export const SubnamesTable = ({ subnames }: SubnamesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: subnames as SubnameRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows

  return (
    <>
      <header className="bg-gray-100 px-6 pb-6 pt-12 flex flex-col gap-4 sticky top-0 z-10">
        <h1 className="text-[30px] font-medium leading-tight">Subnames</h1>
        <InputGroup className="bg-white rounded-sm">
          <InputGroupInput
            className="w-full"
            placeholder="Search..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </header>

      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="border-b border-gray-200 px-6 py-4 flex flex-col gap-3"
            >
              <div className="flex flex-row gap-2 items-center">
                <NameAvatar
                  name={row.original.name}
                  height="40px"
                  width="40px"
                  rounded="rounded-sm"
                />
                <div className="flex flex-col">
                  <Link
                    to="/$name"
                    params={{ name: row.original.name }}
                    className="font-mono text-sm underline decoration-dotted"
                  >
                    {row.original.name}
                  </Link>
                </div>
              </div>
              <div className="flex flex-row gap-2 items-center text-sm text-gray-500">
                <span>Owner:</span>
                <Link
                  to="/addr/$addr"
                  params={{ addr: row.original.owner }}
                  className="font-mono underline decoration-dotted"
                >
                  {truncateAddress(row.original.owner)}
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-8 text-center text-gray-500">
            No subnames found.
          </div>
        )}
      </div>

      {/* Desktop view - Table layout */}
      <Table className="relative hidden md:table">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="px-6 py-2">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell className="px-6 py-4" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No subnames found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  )
}
