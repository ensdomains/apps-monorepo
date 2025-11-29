import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import type { DataTableProps } from '../molecules/DataTable/DataTable'
import { Button } from '../ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

const createExpanderColumn = <
  TData extends { items: string[] },
>(): ColumnDef<TData> => ({
  id: 'expander',
  header: () => <div />,
  cell: ({ row }) => {
    const count = row.original.items.length
    return (
      <div className="flex flex-row items-center gap-1">
        {count > 0 && (
          <Button
            variant="outline"
            size="sm"
            aria-label={
              row.getIsExpanded() ? 'Collapse events' : 'Expand events'
            }
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
          >
            {row.getIsExpanded() ? <ChevronUp /> : <ChevronDown />}
            <span className="text-sm font-medium">{count}</span>
          </Button>
        )}
      </div>
    )
  },
})

export const GroupedDataTable = <TData extends { items: string[] }, TValue>({
  data,
  columns,
}: DataTableProps<TData, TValue>) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const table = useReactTable({
    data,
    columns: [createExpanderColumn<TData>(), ...columns],
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onExpandedChange: setExpanded,
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      sorting,
      expanded,
    },
  })

  const [tableView] = useTableViewSettings()

  return (
    <Table className="relative">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={cn(
                  header.column.id === 'expander' && 'w-[200px]', // fixed width
                )}
              >
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
          table.getRowModel().rows.map((row) => (
            <>
              <TableRow
                className={cn(
                  'hover:bg-gray-200',
                  tableView.strippedRows && 'even:bg-gray-100',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      cell.column.id === 'expander' && 'w-[96px]',
                      'px-6',
                      tableView.compact ? 'py-2' : 'py-4',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {row.getIsExpanded() &&
                row.original.items.map((item) => <div key={item}>{item}</div>)}
            </>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={table.getAllColumns().length}
              className="h-24 text-center"
            >
              No data found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
