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
import type {
  ResolverNode,
  ResolverRole,
} from '@/features/resolver/hooks/useResolverOverview'
import {
  type AccountRoleGroup,
  buildResourceToNameMap,
  groupRolesByAccount,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'

type ResolverRolesTableProps = {
  readonly roles: readonly ResolverRole[]
  readonly nodes: readonly ResolverNode[]
  readonly resolverAddress: Address
  readonly canManageRoles: boolean
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
    header: 'Account',
    accessorKey: 'account',
    cell: ({ row }) => (
      <AddressDisplay address={row.original.account as Address} short={false} />
    ),
  },
  {
    header: 'Permission',
    accessorKey: 'permissions',
    id: 'permissions',
    cell: () => <div className="min-w-[200px]">&nbsp;</div>,
  },
  {
    header: 'Name',
    id: 'names',
    cell: ({ row }) => {
      const names = row.original.resolvedNames
      if (names.length === 0) return null
      return (
        <div className="flex flex-wrap gap-1">
          {names.map((name) => (
            <span
              key={name}
              className="font-mono text-sm text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      )
    },
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
            variant="default"
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

export const ResolverRolesTable = ({
  roles,
  nodes,
  resolverAddress,
  canManageRoles,
}: ResolverRolesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<AccountRoleGroup> | null>(
    null,
  )
  const [tableView] = useTableViewSettings()

  const data = useMemo(
    () => groupRolesByAccount(roles, buildResourceToNameMap(nodes)),
    [roles, nodes],
  )

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
      resolverAddress={resolverAddress}
      canManageRoles={canManageRoles}
    >
      {/* Mobile view */}
      <div className="md:hidden">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => {
            const permissionMap = roleToPermissions(row.original.decodedRoles)
            const activePermissions = resolverPermissions.filter((p) =>
              permissionMap.has(p.key),
            )

            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 px-4 py-4 border-b border-border last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <AddressDisplay
                      address={row.original.account as Address}
                      short={false}
                    />
                    {row.original.resolvedNames.length > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.original.resolvedNames.join(', ')}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setClickedRow(row)
                      setSidebarOpen(true)
                    }}
                  >
                    <PanelRightOpen className="h-4 w-4" />
                    <span className="text-sm font-medium">More</span>
                  </Button>
                </div>
                {activePermissions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activePermissions.map((permission) => {
                      const perms = permissionMap.get(permission.key)
                      return (
                        <div
                          key={permission.key}
                          className="flex flex-col gap-1"
                        >
                          <span className="text-xs text-muted-foreground">
                            {permission.title}
                          </span>
                          <div className="flex gap-1">
                            {perms?.admin && (
                              <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-5.5 text-xs">
                                <UserLockIcon width={12} height={12} /> Admin
                              </div>
                            )}
                            {perms?.manager && (
                              <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-5.5 text-xs">
                                <UserIcon width={12} height={12} /> Manager
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="px-6 py-24 text-center border border-border rounded-sm">
            No role holders found.
          </div>
        )}
      </div>

      {/* Desktop view */}
      <div className="hidden md:block">
        <div className="overflow-hidden">
          <Table className="relative border-separate border-spacing-0">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'border-b border-b-border',
                        header.column.id === 'expander' && 'w-25',
                        header.column.id === 'permissions' && 'min-w-50',
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
                  const permissionMap = roleToPermissions(
                    row.original.decodedRoles,
                  )
                  const permissionEntries = Array.from(permissionMap.entries())

                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={cn(
                          'hover:bg-muted',
                          tableView.strippedRows && 'odd:bg-muted',
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
                        resolverPermissions
                          .filter((p) =>
                            permissionEntries.some(([key]) => key === p.key),
                          )
                          .map((permission, index, filtered) => {
                            const perms = permissionMap.get(permission.key)
                            const isLast = index === filtered.length - 1

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
                                      <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-6.5">
                                        <UserLockIcon width={16} height={16} />{' '}
                                        Admin
                                      </div>
                                    )}
                                    {perms?.manager && (
                                      <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-6.5">
                                        <UserIcon width={16} height={16} />{' '}
                                        Manager
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
                          })}
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
        </div>
      </div>
    </ResolverRolesSidebar>
  )
}
