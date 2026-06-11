import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { Check, PanelRight } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { Button } from '@/components/ui/button'
import { RolesSidebar } from '@/features/roles/components/RolesSidebar'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type RolesTableProps = {
  title?: string
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

const isAdminRole = (role: string) => role.endsWith('_ADMIN')

type RoleRowEntry = {
  label: string
  hasAdmin: boolean
  hasUser: boolean
}

/**
 * Collapse an account's raw roles into one entry per permission, tracking
 * whether the account holds the Admin and/or User (base) variant of it.
 */
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

const GreenCheck = () => (
  <Check className="size-5 text-success-text bg-success-fill rounded-full p-1" />
)

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
  {
    id: 'role',
    header: () => <span className="text-muted-foreground">Role</span>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 text-muted-foreground">
        {toRoleEntries(row.original.items).map((entry) => (
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
        {toRoleEntries(row.original.items).map((entry) => (
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
        {toRoleEntries(row.original.items).map((entry) => (
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

export const RolesTable = ({
  title,
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

  return (
    <RolesSidebar
      row={editingRow}
      open={open}
      setOpen={setOpen}
      name={name}
      canManageRoles={canManageRoles}
      registryAddress={registryAddress}
    >
      <div
        className={cn(
          '[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent',
          canManageRoles &&
            '[&_td:last-child]:p-0 [&_td:last-child]:w-12 [&_td:last-child]:relative',
        )}
      >
        {title && <h2 className="text-xl font-medium mb-4">{title}</h2>}
        <DataTable columns={columns} data={data} />
      </div>
    </RolesSidebar>
  )
}
