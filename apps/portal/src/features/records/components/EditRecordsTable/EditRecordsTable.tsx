import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Check, Trash2, X } from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { SortButton } from '@/components/table/SortButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import {
  type EditableRecord,
  getRecordId,
} from '@/utils/records/editRecordUtils'

type EditRecordsTableProps = {
  records: NameRecord[]
  globalFilter: string
  onDeleteRecord?: (record: EditableRecord) => void
  onUpdateRecord?: (record: EditableRecord, newValue: string) => void
}

/** Gets a display name for a record (used in delete confirmation) */
function getRecordDisplayName(record: EditableRecord): string {
  if (record.type === 'contentHash') {
    return 'contenthash'
  }
  return record.key
}

export const EditRecordsTable = ({
  records,
  globalFilter,
  onDeleteRecord,
  onUpdateRecord,
}: EditRecordsTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleDeleteClick = useCallback((record: EditableRecord) => {
    setPendingDeleteId(getRecordId(record))
  }, [])

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null)
  }, [])

  const handleConfirmDelete = useCallback(
    (record: EditableRecord) => {
      onDeleteRecord?.(record)
      setPendingDeleteId(null)
    },
    [onDeleteRecord],
  )

  const editColumns: ColumnDef<EditableRecord>[] = useMemo(
    () => [
      {
        enableSorting: false,
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
        accessorKey: 'key',
        header: ({ column }) => {
          return (
            <SortButton
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
              sortDirection={column.getIsSorted()}
            >
              Key
            </SortButton>
          )
        },
        cell: ({ row }) => {
          const type = row.original.type
          const key =
            row.original.type === 'contentHash'
              ? 'contenthash'
              : row.original.key
          if (type === 'address') {
            return (
              <span className="flex flex-row items-center gap-2 font-mono">
                {row.original.id}{' '}
                <span className="font-sans text-gray-500 uppercase">{key}</span>
              </span>
            )
          }
          return <span className="font-mono">{key}</span>
        },
      },
      {
        accessorKey: 'value',
        header: ({ column }) => {
          return (
            <SortButton
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
              sortDirection={column.getIsSorted()}
            >
              Value
            </SortButton>
          )
        },
        cell: ({ row }) => {
          const value = row.original.value
          return (
            <Input
              defaultValue={value}
              className="font-mono bg-gray-50 border-gray-300"
              onChange={(e) => {
                onUpdateRecord?.(row.original, e.target.value)
              }}
            />
          )
        },
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <CopyButton value={row.original.value} />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 hover:text-destructive"
              onClick={() => handleDeleteClick(row.original)}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Delete record</span>
            </Button>
          </div>
        ),
      },
    ],
    [onUpdateRecord, handleDeleteClick],
  )

  const table = useReactTable({
    data: records as EditableRecord[],
    columns: editColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => getRecordId(row),
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
    globalFilterFn: 'includesString',
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
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
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => {
            const rowId = getRecordId(row.original)
            const isPendingDelete = pendingDeleteId === rowId

            return (
              <React.Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() && 'selected'}
                  className="hover:bg-gray-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 sm:px-6 py-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {isPendingDelete && (
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableCell
                      colSpan={editColumns.length}
                      className="px-4 sm:px-6 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          Remove {getRecordDisplayName(row.original)}?
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
            <TableCell
              colSpan={editColumns.length}
              className="h-24 text-center"
            >
              No records found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
