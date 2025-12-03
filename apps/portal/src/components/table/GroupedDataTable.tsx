import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, PanelRightOpen } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { RolesSidebar } from '@/features/roles/components/RolesSidebar'
import { cn } from '@/lib/utils'
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

const createMoreColumn = <
  TData extends { items: string[] },
>(): ColumnDef<TData> => ({
  id: 'more',
  header: () => null,
  cell: ({ row, table }) => {
    return (
      <div className="flex justify-end pr-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            const meta = table.options.meta as {
              onMoreClick?: (r: typeof row) => void
            }
            meta?.onMoreClick?.(row)
          }}
        >
          <PanelRightOpen className="h-4 w-4" />
          <span className="text-sm font-medium">More</span>
        </Button>
      </div>
    )
  },
})

interface GroupedDataTableProps<TData, TValue> {
  data: TData[]
  columns: ColumnDef<TData, TValue>[]
}

export const GroupedDataTable = <TData extends { items: string[] }, TValue>({
  data,
  columns,
}: GroupedDataTableProps<TData, TValue>) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<TData> | null>(null)

  const table = useReactTable({
    data,
    columns: [
      createExpanderColumn<TData>(),
      ...columns,
      createMoreColumn<TData>(),
    ],
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onExpandedChange: setExpanded,
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      sorting,
      expanded,
    },
    meta: {
      onMoreClick: (row: Row<TData>) => {
        setClickedRow(row)
        setSidebarOpen(true)
      },
    },
  })

  const [tableView] = useTableViewSettings()

  return (
    <RolesSidebar<TData>
      row={clickedRow}
      open={sidebarOpen}
      setOpen={setSidebarOpen}
    >
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
              <Fragment key={row.id}>
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() &&
                  row.original.items.map((item: string) => (
                    <TableRow key={item} className="bg-gray-50">
                      <TableCell
                        colSpan={table.getAllColumns().length}
                        className="py-2 px-12"
                      >
                        {item}
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
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
    </RolesSidebar>
  )
}
