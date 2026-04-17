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
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { SortButton } from '@/components/table/SortButton'
import { Button } from '@/components/ui/button'
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
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export interface SubnameRow {
  readonly name: string
  readonly owner: Address
}

const OwnerCell = ({ owner }: { owner: Address }) => (
  <div className="flex flex-row gap-2 items-center">
    <NameAvatar name={owner} height="20px" width="20px" rounded="rounded-sm" />
    <EntityBadgeWithActions variant="address" address={owner}>
      {truncateAddress(owner)}
    </EntityBadgeWithActions>
  </div>
)

const columns: ColumnDef<SubnameRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
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
            height="20px"
            width="20px"
            rounded="rounded-sm"
          />
          <EntityBadgeWithActions variant="name" name={name}>
            {name}
          </EntityBadgeWithActions>
        </div>
      )
    },
  },
  {
    accessorKey: 'owner',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Owner
      </SortButton>
    ),
    cell: ({ row }) => <OwnerCell owner={row.original.owner} />,
  },
]

interface SubnamesTableProps {
  readonly subnames: readonly SubnameRow[]
  readonly name: string
  readonly canCreateSubname?: boolean
}

export const SubnamesTable = ({
  subnames,
  name,
  canCreateSubname,
}: SubnamesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [tableView] = useTableViewSettings()

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
      <header className="bg-muted border-b border-border px-6 pb-6 pt-12 flex flex-col gap-4 sticky top-0 z-10">
        <div className="flex flex-row items-center gap-2">
          <h1 className="text-[30px] font-medium leading-tight flex-1">
            {subnames.length} subname{subnames.length !== 1 ? 's' : ''}
          </h1>
          {canCreateSubname && (
            <Button variant="secondary" asChild>
              <Link to="/$name/create-subname" params={{ name }}>
                <Plus className="size-6" />
                Create subname
              </Link>
            </Button>
          )}
        </div>
        <InputGroup className="bg-background rounded-sm">
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
              className="border-b border-border px-6 py-4 flex flex-col gap-3"
            >
              <div className="flex flex-row gap-2 items-center">
                <NameAvatar
                  name={row.original.name}
                  height="20px"
                  width="20px"
                  rounded="rounded-sm"
                />
                <EntityBadgeWithActions variant="name" name={row.original.name}>
                  {row.original.name}
                </EntityBadgeWithActions>
              </div>
              <div className="flex flex-row gap-2 items-center">
                <span className="text-sm text-muted-foreground">Owner:</span>
                <EntityBadgeWithActions
                  variant="address"
                  address={row.original.owner}
                >
                  {truncateAddress(row.original.owner)}
                </EntityBadgeWithActions>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-8 text-center text-muted-foreground">
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
              <TableRow
                key={row.id}
                className={cn(
                  'hover:bg-muted',
                  tableView.strippedRows && 'odd:bg-muted',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={cn('px-6', tableView.compact ? 'py-2' : 'py-4')}
                    key={cell.id}
                  >
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
