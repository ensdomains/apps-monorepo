import type { ColumnDef, Row } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ResolverRolesSidebar } from '@/features/resolver/components/ResolverRolesSidebar'
import type {
  ResolverNode,
  ResolverRole,
} from '@/features/resolver/hooks/useResolverOverview'
import {
  buildEditActionColumn,
  buildRoleColumns,
  type RoleRowEntry,
  rolesTableClassName,
} from '@/features/roles/components/roleTableColumns'
import {
  type AccountRoleGroup,
  buildResourceToNameMap,
  groupRolesByAccountResource,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type ResolverRolesTableProps = {
  readonly roles: readonly ResolverRole[]
  readonly nodes: readonly ResolverNode[]
  readonly resolverAddress: Address
  readonly canManageRoles: boolean
  /** Render read-only: no edit action, no slider (e.g. embedded on /$name/roles). */
  readonly disableEdit?: boolean
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
  ...buildRoleColumns<AccountRoleGroup>((row) =>
    toRoleEntries(row.decodedRoles),
  ),
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
    () => groupRolesByAccountResource(roles, buildResourceToNameMap(nodes)),
    [roles, nodes],
  )

  const showActions = canManageRoles && !disableEdit

  const columns: ColumnDef<AccountRoleGroup>[] = showActions
    ? [
        ...baseColumns,
        buildEditActionColumn<AccountRoleGroup>((row) => {
          setEditingRow(row)
          setOpen(true)
        }),
      ]
    : baseColumns

  const table = (
    <div className={rolesTableClassName(showActions)}>
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
