import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useWalletClient } from 'wagmi'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import {
  buildEditActionColumn,
  buildRoleColumns,
  rolesTableClassName,
  rolesToEntries,
  UserCell,
} from '@/features/roles/components/roleTableColumns'
import {
  getRegistryRootRoleHoldersQueryOptions,
  type RootRoleHolder,
} from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { getHasRolesQueryOptions } from '../../hooks/useHasRoles'
import { RegistryEditUserSheet } from './RegistryEditUserSheet'

const baseColumns: ColumnDef<RootRoleHolder>[] = [
  {
    id: 'user',
    accessorKey: 'account',
    header: 'User',
    cell: ({ row }) => <UserCell account={row.original.account} />,
  },
  ...buildRoleColumns<RootRoleHolder>((row) => rolesToEntries(row.roles)),
]

export const RegistryRolesTable = ({
  address,
  disableEdit = false,
}: {
  address: Address
  /** Render read-only: no edit action, no slider (e.g. embedded on /$name/roles). */
  disableEdit?: boolean
}) => {
  const {
    data: roles,
    isLoading,
    error,
  } = useQuery(
    getRegistryRootRoleHoldersQueryOptions({ registryAddress: address }),
  )

  const [editingRow, setEditingRow] = useState<RootRoleHolder | null>(null)
  const { data: walletClient } = useWalletClient()
  const callerAddress = walletClient?.account?.address
  const { data: isAdmin = false } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: address,
      roles: ['ROLE_REGISTRAR_ADMIN'],
      account: callerAddress ?? zeroAddress,
    }),
    enabled: !!callerAddress && !disableEdit,
  })

  const showActions = isAdmin && !disableEdit

  const columns: ColumnDef<RootRoleHolder>[] = showActions
    ? [
        ...baseColumns,
        buildEditActionColumn<RootRoleHolder>((row) =>
          setEditingRow(row.original),
        ),
      ]
    : baseColumns

  const rows = roles ?? []

  if (isLoading) return <LoadingSpinner title="Loading roles..." />

  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching roles. Please refresh the page."
      />
    )
  }

  if (rows.length === 0)
    return (
      <NoResultsMessage
        title="No role holders yet"
        description="Accounts with roles on this registry will appear here."
        className="mx-0"
      />
    )

  return (
    <div className={rolesTableClassName(showActions)}>
      <DataTable columns={columns} data={rows} />
      {showActions && (
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
