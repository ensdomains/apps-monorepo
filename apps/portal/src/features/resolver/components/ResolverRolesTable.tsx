import type { ColumnDef, Row } from '@tanstack/react-table'
import { Check, PanelRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { Button } from '@/components/ui/button'
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
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type ResolverRolesTableProps = {
  readonly roles: readonly ResolverRole[]
  readonly nodes: readonly ResolverNode[]
  readonly resolverAddress: Address
  readonly canManageRoles: boolean
  /** Render read-only: no edit action, no slider (e.g. embedded on /$name/roles). */
  readonly disableEdit?: boolean
}

type RoleRowEntry = {
  label: string
  hasAdmin: boolean
  hasUser: boolean
}

/** One entry per held resolver permission, with its Admin / User (manager) state. */
const toRoleEntries = (decodedRoles: readonly string[]): RoleRowEntry[] => {
  const map = roleToPermissions(decodedRoles)
  return resolverPermissions
    .filter((p) => map.has(p.key))
    .map((p) => ({
      label: p.title,
      hasAdmin: Boolean(map.get(p.key)?.admin),
      hasUser: Boolean(map.get(p.key)?.manager),
    }))
}

/** Names a role group is scoped to — `(root)` means it applies to every name. */
const scopeLabel = (resolvedNames: readonly string[]): string => {
  if (resolvedNames.includes('(root)')) return 'All names'
  const names = resolvedNames.filter((n) => n !== '(root)')
  return names.length > 0 ? names.join(', ') : '—'
}

const GreenCheck = () => (
  <Check className="size-5 text-success-text bg-success-fill rounded-full p-1" />
)

const baseColumns: ColumnDef<AccountRoleGroup>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => (
      <div className="w-32">
        <EntityBadge
          variant="address"
          address={row.original.account as Address}
        >
          {truncateAddress(row.original.account as Address, 6, 4)}
        </EntityBadge>
      </div>
    ),
  },
  {
    id: 'name',
    header: () => <span className="text-muted-foreground">Name</span>,
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">
        {scopeLabel(row.original.resolvedNames)}
      </span>
    ),
  },
  {
    id: 'role',
    header: () => <span className="text-muted-foreground">Role</span>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 text-muted-foreground">
        {toRoleEntries(row.original.decodedRoles).map((entry) => (
          <span
            className="font-mono pb-2 leading-5 h-5 box-content"
            key={entry.label}
          >
            {entry.label}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: 'admin',
    header: () => <span className="text-muted-foreground">Admin</span>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        {toRoleEntries(row.original.decodedRoles).map((entry) => (
          <div
            className="h-5 pb-2 box-content flex items-center"
            key={entry.label}
          >
            {entry.hasAdmin ? <GreenCheck /> : null}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'user-level',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        {toRoleEntries(row.original.decodedRoles).map((entry) => (
          <div
            className="h-5 pb-2 box-content flex items-center"
            key={entry.label}
          >
            {entry.hasUser ? <GreenCheck /> : null}
          </div>
        ))}
      </div>
    ),
  },
]

export const ResolverRolesTable = ({
  roles,
  nodes,
  resolverAddress,
  canManageRoles,
  disableEdit = false,
}: ResolverRolesTableProps) => {
  const [editingRow, setEditingRow] = useState<Row<AccountRoleGroup> | null>(
    null,
  )
  const [open, setOpen] = useState(false)

  const data = useMemo(
    () => groupRolesByAccount(roles, buildResourceToNameMap(nodes)),
    [roles, nodes],
  )

  const showActions = canManageRoles && !disableEdit

  const columns: ColumnDef<AccountRoleGroup>[] = showActions
    ? [
        ...baseColumns,
        {
          id: 'actions',
          header: () => null,
          cell: ({ row }) => (
            <Button
              variant="secondary"
              aria-label="Edit user roles"
              className="absolute inset-0 h-auto w-8 rounded-sm p-0 mt-4 flex items-center justify-center"
              onClick={() => {
                setEditingRow(row)
                setOpen(true)
              }}
            >
              <PanelRight className="size-4 text-muted-foreground" />
            </Button>
          ),
        },
      ]
    : baseColumns

  const table = (
    <div
      className={cn(
        '[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent',
        showActions &&
          '[&_td:last-child]:p-0 [&_td:last-child]:w-12 [&_td:last-child]:relative',
      )}
    >
      <DataTable columns={columns} data={data} />
    </div>
  )

  // Read-only embed: no slider, just the table.
  if (disableEdit) return table

  return (
    <ResolverRolesSidebar
      row={editingRow}
      open={open}
      setOpen={setOpen}
      resolverAddress={resolverAddress}
      canManageRoles={canManageRoles}
    >
      {table}
    </ResolverRolesSidebar>
  )
}
