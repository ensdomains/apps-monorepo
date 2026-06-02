import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check, PanelRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { useIsRegistryAdmin } from '../../hooks/useIsRegistryAdmin'
import {
  getRegistryRolesQueryOptions,
  type RegistryRoleRow,
} from '../../hooks/useRegistryRoles'
import { RegistryEditUserSheet } from './RegistryEditUserSheet'

const isAdminRole = (role: Role) => role.endsWith('_ADMIN')

const formatRole = (role: Role) =>
  role
    .replace(/^ROLE_/, '')
    .replace(/_ADMIN$/, '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

type RoleRowEntry = {
  label: string
  hasAdmin: boolean
  hasUser: boolean
}

const toRoleEntries = (roles: Role[]): RoleRowEntry[] => {
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
      {truncateAddress(account, 6, 4, '...')}
    </EntityBadge>
  </div>
)

export const RegistryRolesTable = ({ address }: { address: Address }) => {
  const {
    data: roles,
    isLoading,
    error,
  } = useQuery(getRegistryRolesQueryOptions({ address }))

  const [editingRow, setEditingRow] = useState<RegistryRoleRow | null>(null)
  // Admin-only actions column (per-row Edit icon) — non-admin viewers see a
  // read-only table.
  const isAdmin = useIsRegistryAdmin(address)

  const columns = useMemo<ColumnDef<RegistryRoleRow>[]>(
    () => [
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
            {toRoleEntries(row.original.roles).map((entry) => (
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
            {toRoleEntries(row.original.roles).map((entry) => (
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
            {toRoleEntries(row.original.roles).map((entry) => (
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
      ...(isAdmin
        ? [
            {
              id: 'actions',
              header: () => null,
              cell: ({ row }) => (
                <Button
                  onClick={() => setEditingRow(row.original)}
                  aria-label="Edit user roles"
                  variant="secondary"
                  className="absolute inset-0 h-auto w-8 rounded-sm p-0 mt-4 flex items-center justify-center"
                >
                  <PanelRight className="size-4 text-muted-foreground" />
                </Button>
              ),
            } satisfies ColumnDef<RegistryRoleRow>,
          ]
        : []),
    ],
    [isAdmin],
  )

  const rows = roles ?? []

  if (isLoading) return <LoadingSpinner title="Loading roles..." />

  if (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message
    return <div>Error loading roles{message ? `: ${message}` : ''}</div>
  }

  return (
    <div
      className={cn(
        '[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent',
        // Last-cell overrides target the Edit-icon column — only present for
        // admins. Skipping these for non-admins prevents the table's
        // last visible column (User-level check) from getting squished.
        isAdmin &&
          '[&_td:last-child]:p-0 [&_td:last-child]:w-12 [&_td:last-child]:relative',
      )}
    >
      <DataTable columns={columns} data={rows} />
      {isAdmin && (
        <RegistryEditUserSheet
          open={!!editingRow}
          onOpenChange={(open) => {
            if (!open) setEditingRow(null)
          }}
          registryAddress={address}
          account={editingRow?.account ?? null}
          currentRoles={editingRow?.roles ?? []}
        />
      )}
    </div>
  )
}
