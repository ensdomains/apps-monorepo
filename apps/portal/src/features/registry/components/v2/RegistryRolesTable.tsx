import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
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

const roleLabels = (roles: Role[]) =>
  Array.from(new Set(roles.map(formatRole))).join(', ')

const GreenCheck = () => <Check className="size-4 text-green-600" />

const columns: ColumnDef<RegistryRoleRow>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => (
      <AddressDisplay address={row.original.account} short={false} />
    ),
  },
  {
    id: 'role',
    header: () => <span className="text-muted-foreground">Role</span>,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {roleLabels(row.original.roles)}
      </span>
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

  return <DataTable columns={columns} data={data ?? []} />
}
