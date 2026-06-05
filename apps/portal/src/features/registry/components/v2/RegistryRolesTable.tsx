import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  getRegistryRolesQueryOptions,
  type RegistryRoleRow,
} from '../../hooks/useRegistryRoles'

const isAdminRole = (role: Role) => role.endsWith('_ADMIN')

const hasAdmin = (roles: Role[]) => roles.some(isAdminRole)
const hasUser = (roles: Role[]) => roles.some((role) => !isAdminRole(role))

const formatRole = (role: Role) =>
  role
    .replace(/^ROLE_/, '')
    .replace(/_ADMIN$/, '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const roleLabels = (roles: Role[]) => Array.from(new Set(roles.map(formatRole)))

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

const columns: ColumnDef<RegistryRoleRow>[] = [
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
        {roleLabels(row.original.roles).map((label) => (
          <span className="font-mono pb-2" key={label}>
            {label}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: 'admin',
    header: () => <span className="text-muted-foreground">Admin</span>,
    cell: ({ row }) => (hasAdmin(row.original.roles) ? <GreenCheck /> : null),
  },
  {
    id: 'user-level',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => (hasUser(row.original.roles) ? <GreenCheck /> : null),
  },
]

export const RegistryRolesTable = ({ address }: { address: Address }) => {
  const {
    data: roles,
    isLoading,
    error,
  } = useQuery(getRegistryRolesQueryOptions({ address }))

  const rows = roles ?? []

  if (isLoading) return <LoadingSpinner title="Loading roles..." />

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load roles"
        description={error.cause?.message ?? error.message}
      />
    )
  }

  return (
    <div className="[&_td]:align-top [&_.overflow-x-auto]:overflow-visible">
      <DataTable columns={columns} data={rows} />
    </div>
  )
}
