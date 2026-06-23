import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export const DataTable = <TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [tableView] = useTableViewSettings()
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              return (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row, _i) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
              className={cn(
                // Unstriped: every row lifts to the subtle tone on hover.
                // `/60` lightens the existing sidebar token toward the row bg
                // (tune this number for a lighter/stronger tint).
                !tableView.strippedRows && 'hover:bg-sidebar/60',
                // Striped: odd rows carry the tint and clear to white on hover;
                // even (white) rows pick up the tint — so every row reacts.
                tableView.strippedRows &&
                  'odd:bg-sidebar/60 odd:hover:bg-background even:hover:bg-sidebar/60',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  className={cn(
                    'px-4 sm:px-6',
                    tableView.compact ? 'py-2' : 'py-4',
                  )}
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
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
