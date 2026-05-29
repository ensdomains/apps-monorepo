import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  getRegistryRolesQueryOptions,
  type RegistryRoleRow,
} from '../../hooks/useRegistryRoles'

const isAdminRole = (role: Role) => role.endsWith('_ADMIN')

const hasAdmin = (roles: Role[]) => roles.some(isAdminRole)
const hasUser = (roles: Role[]) => roles.some((role) => !isAdminRole(role))

// "ROLE_SET_RESOLVER" -> "Set Resolver"; admin variants collapse onto their base.
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

const UserCell = ({ account }: { account: Address }) => {
  const { data: primaryName } = useQuery(getPrimaryNameQueryOptions(account))

  if (primaryName)
    return (
      <span className="font-medium" title={account}>
        {primaryName}
      </span>
    )
  return (
    <AddressDisplay
      address={truncateAddress(account, 6, 4) as Address}
      short={false}
    />
  )
}

const columns: ColumnDef<RegistryRoleRow>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => <UserCell account={row.original.account as Address} />,
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
  const { data, isLoading, error } = useQuery(
    getRegistryRolesQueryOptions({ address }),
  )

  if (isLoading) return <LoadingSpinner title="Loading roles..." />

  if (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message
    return <div>Error loading roles{message ? `: ${message}` : ''}</div>
  }

  return (
    <div className="[&_td]:align-top">
      <DataTable columns={columns} data={data ?? []} />
    </div>
  )
}
