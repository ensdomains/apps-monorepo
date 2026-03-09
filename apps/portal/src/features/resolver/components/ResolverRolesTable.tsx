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
import { Fragment, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { ResolverRolesSidebar } from '@/features/resolver/components/ResolverRolesSidebar'
import type { ResolverRole } from '@/features/resolver/hooks/useResolverOverview'
import {
  decodeResolverRoleBitmap,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'

export type AccountRoleGroup = {
  readonly account: Address
  readonly roles: readonly ResolverRole[]
  readonly decodedRoles: readonly string[]
}

type ResolverRolesTableProps = {
  readonly roles: readonly ResolverRole[]
}

const columns: ColumnDef<AccountRoleGroup>[] = [
  {
    id: 'expander',
    cell: ({ row }) => {
      const decoded = roleToPermissions(row.original.decodedRoles)
      const count = decoded.size
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
  },
  {
    header: 'Role',
    accessorKey: 'account',
    cell: ({ row }) => (
      <AddressDisplay address={row.original.account} short={false} />
    ),
  },
  {
    header: 'Permission',
    accessorKey: 'permissions',
    id: 'permissions',
    cell: () => <div className="min-w-[200px]">&nbsp;</div>,
  },
  {
    id: 'more',
    header: () => null,
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        onMoreClick?: (r: Row<AccountRoleGroup>) => void
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
  },
]

export const ResolverRolesTable = ({ roles }: ResolverRolesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<AccountRoleGroup> | null>(
    null,
  )
  const [tableView] = useTableViewSettings()

  const data: AccountRoleGroup[] = useMemo(() => {
    const grouped = new Map<
      string,
      { roles: ResolverRole[]; decodedRoles: string[] }
    >()
    for (const role of roles) {
      const account = role.account.toLowerCase()
      const decoded = decodeResolverRoleBitmap(role.roleBitmap)
      const existing = grouped.get(account)
      if (existing) {
        existing.roles.push(role)
        existing.decodedRoles.push(...decoded)
      } else {
        grouped.set(account, { roles: [role], decodedRoles: [...decoded] })
      }
    }
    return Array.from(grouped.entries()).map(([account, group]) => ({
      account: account as Address,
      roles: group.roles,
      decodedRoles: group.decodedRoles,
    }))
  }, [roles])

  const table = useReactTable<AccountRoleGroup>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onExpandedChange: setExpanded,
    getExpandedRowModel: getExpandedRowModel(),
    state: { sorting, expanded },
    meta: {
      onMoreClick: (row: Row<AccountRoleGroup>) => {
        setClickedRow(row)
        setSidebarOpen(true)
      },
    },
  })

  return (
    <ResolverRolesSidebar
      row={clickedRow}
      open={sidebarOpen}
      setOpen={setSidebarOpen}
    >
      <Table className="relative border border-border rounded-2xl border-separate border-spacing-0">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'border-b border-b-border',
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
            table.getRowModel().rows.map((row) => {
              const permissionMap = roleToPermissions(row.original.decodedRoles)
              const permissionEntries = Array.from(permissionMap.entries())

              return (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn(
                      'hover:bg-quartz-50',
                      tableView.strippedRows && 'odd:bg-quartz-50',
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
                      const activePermissions = resolverPermissions.filter(
                        (p) => permissionEntries.some(([key]) => key === p.key),
                      )
                      return activePermissions.map((permission, index) => {
                        const perms = permissionMap.get(permission.key)
                        const isLast = index === activePermissions.length - 1

                        return (
                          <TableRow key={permission.key}>
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-border',
                              )}
                            />
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-border',
                              )}
                            >
                              <CopyableRecord
                                displayValue={permission.title}
                                value={permission.key}
                              />
                            </TableCell>
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-border',
                              )}
                            >
                              <div className="flex flex-row gap-2">
                                {perms?.admin && (
                                  <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px]">
                                    <UserLockIcon width={16} height={16} />{' '}
                                    Admin
                                  </div>
                                )}
                                {perms?.manager && (
                                  <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px]">
                                    <UserIcon width={16} height={16} /> Manager
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'px-6',
                                tableView.compact ? 'py-2' : 'py-4',
                                !isLast && 'border-b border-b-border',
                              )}
                            />
                          </TableRow>
                        )
                      })
                    })()}
                </Fragment>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center"
              >
                No role holders found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ResolverRolesSidebar>
  )
}
