import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { RolesSidebar } from '@/features/roles/components/RolesSidebar'
import {
  buildEditActionColumn,
  buildRoleColumns,
  type RoleRowEntry,
  rolesTableClassName,
} from '@/features/roles/components/roleTableColumns'
import { isAdminRole } from '@/lib/roles/permissions'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type RolesTableProps = {
  name: string
  canManageRoles: boolean
  roles: GetNameRolesAccountsReturnType
  registryAddress: Address
}

type AccountGroup = {
  account: Address
  items: string[]
}

const formatRole = (role: string) =>
  role
    .replace(/^ROLE_/, '')
    .replace(/_ADMIN$/, '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const toRoleEntries = (roles: string[]): RoleRowEntry[] => {
  const map = new Map<string, RoleRowEntry>()
  for (const role of roles) {
    const label = formatRole(role)
    const existing = map.get(label) ?? {
      label,
      hasAdmin: false,
      hasUser: false,
    }
    if (isAdminRole(role)) existing.hasAdmin = true
    else existing.hasUser = true
    map.set(label, existing)
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

const UserCell = ({ account }: { account: Address }) => (
  <div className="w-32">
    <EntityBadge variant="address" address={account}>
      {truncateAddress(account, 6, 4)}
    </EntityBadge>
  </div>
)

const baseColumns: ColumnDef<AccountGroup>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => <UserCell account={row.original.account} />,
  },
  ...buildRoleColumns<AccountGroup>((row) => toRoleEntries(row.items)),
]

export const RolesTable = ({
  roles,
  name,
  canManageRoles,
  registryAddress,
}: RolesTableProps) => {
  const [editingRow, setEditingRow] = useState<Row<AccountGroup> | null>(null)
  const [open, setOpen] = useState(false)

  const data: AccountGroup[] = Array.from(roles.entries())
    .filter(([, roleNames]) => roleNames.length > 0)
    .map(([account, roleNames]) => ({ account, items: roleNames }))

  const columns: ColumnDef<AccountGroup>[] = canManageRoles
    ? [
        ...baseColumns,
        buildEditActionColumn<AccountGroup>((row) => {
          setEditingRow(row)
          setOpen(true)
        }),
      ]
    : baseColumns

  return (
    <RolesSidebar
      row={editingRow}
      open={open}
      setOpen={setOpen}
      name={name}
      canManageRoles={canManageRoles}
      registryAddress={registryAddress}
    >
      <div className={rolesTableClassName(canManageRoles)}>
        <DataTable columns={columns} data={data} />
      </div>
    </RolesSidebar>
  )
}
