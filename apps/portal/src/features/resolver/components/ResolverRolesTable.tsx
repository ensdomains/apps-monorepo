import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ResolverRolesSidebar } from '@/features/resolver/components/ResolverRolesSidebar'
import type {
  ResolverNamedResource,
  ResolverRole,
} from '@/features/resolver/hooks/useResolverOverview'
import {
  buildActionSpacerColumn,
  buildEditActionColumn,
  buildRoleColumns,
  ROLE_COLUMN_WIDTH,
  type RoleRowEntry,
  rolesTableClassName,
} from '@/features/roles/components/roleTableColumns'
import {
  type AccountRoleGroup,
  buildResourceLabels,
  groupRolesByAccount,
  planAccountRemoval,
  resolverPermissions,
  resolverRoleGroupId,
} from '@/lib/roles/resolverRoles'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type ResolverRolesTableProps = {
  readonly roles: readonly ResolverRole[]
  /** Resource preimages from `ResourceArgument`, for labelling scoped grants. */
  readonly namedResources?: readonly ResolverNamedResource[]
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

const baseColumns: ColumnDef<AccountRoleGroup>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    meta: { width: ROLE_COLUMN_WIDTH.account },
    header: () => <span className="text-muted-foreground">Account</span>,
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
    id: 'scope',
    accessorKey: 'resourceLabel',
    meta: { width: ROLE_COLUMN_WIDTH.name },
    header: () => <span className="text-muted-foreground">Scope</span>,
    cell: ({ row }) => (
      <span
        className={cn(
          'text-sm',
          row.original.isRoot ? 'text-muted-foreground' : 'font-mono',
        )}
      >
        {row.original.resourceLabel}
      </span>
    ),
  },
  ...buildRoleColumns<AccountRoleGroup>((row) =>
    toRoleEntries(row.decodedRoles),
  ),
]

export const ResolverRolesTable = ({
  roles,
  namedResources,
  resolverAddress,
  canManageRoles,
  disableEdit = false,
}: ResolverRolesTableProps) => {
  // The selection is an identity, not a row object: the row it names is looked
  // up in the current data on every render, so a refetch can't leave the
  // editor on stale roles, and a removed row closes the editor instead of
  // handing its place to the next account.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const revealed = useMemo(
    () => buildResourceLabels(namedResources ?? []),
    [namedResources],
  )
  const data = useMemo(
    () => groupRolesByAccount(roles, revealed),
    [roles, revealed],
  )

  const editingGroup =
    data.find((group) => resolverRoleGroupId(group) === editingId) ?? null
  const removalPlan = editingGroup
    ? planAccountRemoval(roles, editingGroup.account, revealed)
    : null

  const showActions = canManageRoles && !disableEdit

  const columns: ColumnDef<AccountRoleGroup>[] = showActions
    ? [
        ...baseColumns,
        buildEditActionColumn<AccountRoleGroup>((row) => {
          setEditingId(resolverRoleGroupId(row.original))
          setOpen(true)
        }),
      ]
    : [...baseColumns, buildActionSpacerColumn<AccountRoleGroup>()]

  const table = (
    <div className={rolesTableClassName(showActions)}>
      <DataTable columns={columns} data={data} getRowId={resolverRoleGroupId} />
    </div>
  )

  // Read-only embed: no slider, just the table.
  if (disableEdit) return table

  return (
    <ResolverRolesSidebar
      group={editingGroup}
      removalPlan={removalPlan}
      open={open}
      setOpen={setOpen}
      resolverAddress={resolverAddress}
      canManageRoles={canManageRoles}
    >
      {table}
    </ResolverRolesSidebar>
  )
}
