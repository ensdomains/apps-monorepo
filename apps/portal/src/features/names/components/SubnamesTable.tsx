import { Link } from '@tanstack/react-router'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Check, Plus, Search, Trash2, X } from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { SortButton } from '@/components/table/SortButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  /** Whether the connected user has ROLE_BURN for this specific subname. */
  readonly canDelete?: boolean
}

const OwnerCell = ({ owner }: { owner: Address }) => (
  <div className="flex flex-row gap-2 items-center">
    <NameAvatar name={owner} height="20px" width="20px" rounded="rounded-sm" />
    <EntityBadgeWithActions variant="address" address={owner}>
      {truncateAddress(owner)}
    </EntityBadgeWithActions>
  </div>
)

interface SubnamesTableProps {
  readonly subnames: readonly SubnameRow[]
  readonly name: string
  readonly canCreateSubname?: boolean
  /** Called when user confirms delete on a single subname. */
  readonly onDeleteSubname?: (subname: SubnameRow) => void
  /** Called when user clicks Clear with selection. */
  readonly onClearSelected?: (subnames: SubnameRow[]) => void
}

function buildColumns(
  onDeleteClick?: (name: string) => void,
): ColumnDef<SubnameRow>[] {
  return [
    {
      enableSorting: false,
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
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
    {
      enableSorting: false,
      id: 'actions',
      header: () => null,
      cell: ({ row }) =>
        row.original.canDelete && onDeleteClick ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-gray-500 hover:text-red-600"
            aria-label={`Delete ${row.original.name}`}
            onClick={() => onDeleteClick(row.original.name)}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null,
    },
  ]
}

export const SubnamesTable = ({
  subnames,
  name,
  canCreateSubname,
  onDeleteSubname,
  onClearSelected,
}: SubnamesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [tableView] = useTableViewSettings()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
    null,
  )

  const handleDeleteClick = useCallback((subnameName: string) => {
    setPendingDeleteName(subnameName)
  }, [])

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteName(null)
  }, [])

  const handleConfirmDelete = useCallback(
    (subname: SubnameRow) => {
      onDeleteSubname?.(subname)
      setPendingDeleteName(null)
    },
    [onDeleteSubname],
  )

  const columns = useMemo(
    () => buildColumns(onDeleteSubname ? handleDeleteClick : undefined),
    [onDeleteSubname, handleDeleteClick],
  )

  const table = useReactTable({
    data: subnames as SubnameRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.name,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  const selectedRows = table.getSelectedRowModel().rows
  const selectedCount = selectedRows.length
  const deletableSelected = selectedRows
    .filter((r) => r.original.canDelete)
    .map((r) => r.original)

  return (
    <>
      <header className="bg-muted border-b border-border px-6 pb-6 pt-12 flex flex-col gap-4 sticky top-0 z-10">
        <div className="flex flex-row items-center gap-2">
          <h1 className="text-[30px] font-medium leading-tight flex-1">
            {subnames.length} subname{subnames.length !== 1 ? 's' : ''}
          </h1>
          {canCreateSubname && (
            <Button variant="default" asChild>
              <Link to="/$name/create-subname" params={{ name }}>
                <Plus className="size-4" />
                Create subname
              </Link>
            </Button>
          )}
        </div>
        {selectedCount > 0 && (
          <div className="flex flex-row items-center gap-2">
            <button
              type="button"
              className="cursor-pointer"
              onClick={() => setRowSelection({})}
            >
              <X className="size-6" />
            </button>
            <span className="text-sm text-muted-foreground flex-1">
              {selectedCount} selected
            </span>
            {onClearSelected && deletableSelected.length > 0 && (
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => onClearSelected(deletableSelected)}
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            )}
          </div>
        )}
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
          rows.map((row) => {
            const isPendingDelete = pendingDeleteName === row.original.name

            return (
              <React.Fragment key={row.id}>
                <div className="border-b border-border px-6 py-4 flex flex-col gap-3">
                  <div className="flex flex-row gap-2 items-center">
                    {onDeleteSubname && (
                      <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                      />
                    )}
                    <NameAvatar
                      name={row.original.name}
                      height="20px"
                      width="20px"
                      rounded="rounded-sm"
                    />
                    <EntityBadgeWithActions variant="name" name={row.original.name}>
                      {row.original.name}
                    </EntityBadgeWithActions>
                    {row.original.canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 ml-auto text-muted-foreground hover:text-red-600"
                        aria-label={`Delete ${row.original.name}`}
                        onClick={() => setPendingDeleteName(row.original.name)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
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
                {isPendingDelete && (
                  <div className="border-b border-border bg-muted px-6 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        Remove {row.original.name}?
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelDelete}
                          className="gap-1"
                        >
                          Cancel
                          <X className="size-4" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleConfirmDelete(row.original)}
                          className="gap-1"
                        >
                          Confirm
                          <Check className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            )
          })
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
            rows.map((row) => {
              const isPendingDelete = pendingDeleteName === row.original.name

              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && 'selected'}
                    className={cn(
                      'hover:bg-muted',
                      tableView.strippedRows && 'odd:bg-muted',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={cn(
                          'px-6',
                          tableView.compact ? 'py-2' : 'py-4',
                        )}
                        key={cell.id}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {isPendingDelete && (
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableCell colSpan={columns.length} className="px-6 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            Remove {row.original.name}?
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCancelDelete}
                              className="gap-1"
                            >
                              Cancel
                              <X className="size-4" />
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleConfirmDelete(row.original)}
                              className="gap-1"
                            >
                              Confirm
                              <Check className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )
            })
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
