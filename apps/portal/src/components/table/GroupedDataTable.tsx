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
import {
  ChevronDown,
  ChevronUp,
  PanelRightOpen,
  UserIcon,
  UserLockIcon,
} from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { RolesSidebar } from '@/features/roles/components/RolesSidebar'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import type { DataTableProps } from '../DataTable'
import { Button } from '../ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

type GroupedDataTableProps<
  TData extends { items: string[] },
  TValue,
> = DataTableProps<TData, TValue> & {
  itemsWrapper?: (rowData: TData) => ReactNode
}

export const GroupedDataTable = <TData extends { items: string[] }, TValue>({
  data,
  columns,
}: GroupedDataTableProps<TData, TValue>) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<TData> | null>(null)

  const expanderColumn: ColumnDef<TData> = {
    id: 'expander',
    cell: ({ row }) => {
      const count = row.original.items.length
      return (
        <div className="flex flex-row items-center gap-1">
          {count > 0 && (
            <Button
              variant="outline"
              size="sm"
              aria-label={row.getIsExpanded() ? 'Collapse' : 'Expand'}
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
  }

  const moreColumn: ColumnDef<TData> = {
    id: 'more',
    header: () => null,
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        onMoreClick?: (r: Row<TData>) => void
      }

      return (
        <div className="flex justify-end pr-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              meta?.onMoreClick?.(row)
            }}
          >
            <PanelRightOpen className="h-4 w-4" />
            <span className="text-sm font-medium">More</span>
          </Button>
        </div>
      )
    },
  }

  const table = useReactTable<TData>({
    data,
    columns: [expanderColumn, ...columns, moreColumn],
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
      <Table className="relative border border-gray-300 rounded-2xl border-separate border-spacing-0">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'border-b border-b-gray-300',
                    header.column.id === 'expander' && 'w-[100px]',
                    header.column.id === 'permissions' && 'min-w-[200px]',
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
                  (() => {
                    const permissions = roleToPermissions(row.original.items)
                    const permissionEntries = Array.from(permissions.entries())

                    return permissionEntries.map(
                      ([role, { admin, manager }], index) => {
                        const roleLabel = role
                          .replaceAll('_', ' ')
                          .toLowerCase()
                        const isLast = index === permissionEntries.length - 1

                        return (
                          <TableRow key={role}>
                            {/* Expander column - empty */}
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-gray-200',
                              )}
                            />
                            {/* Role column */}
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-gray-200',
                              )}
                            >
                              <CopyableRecord
                                className="capitalize"
                                displayValue={roleLabel}
                                value={role}
                              />
                            </TableCell>
                            {/* Permission column */}
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-gray-200',
                              )}
                            >
                              <div className="flex flex-row gap-2">
                                {admin && (
                                  <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px]">
                                    <UserLockIcon width={16} height={16} />{' '}
                                    Admin
                                  </div>
                                )}
                                {manager && (
                                  <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px]">
                                    <UserIcon width={16} height={16} /> Manager
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            {/* More column - empty */}
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-gray-200',
                              )}
                            />
                          </TableRow>
                        )
                      },
                    )
                  })()}
              </Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
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
