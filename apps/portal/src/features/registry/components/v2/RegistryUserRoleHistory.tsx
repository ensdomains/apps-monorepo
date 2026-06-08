import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { type Address, zeroAddress } from 'viem'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataTable } from '@/components/DataTable'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Badge } from '@/components/ui/badge'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import type { RoleHistoryEntry } from '@/lib/roles/filterEventsByResource'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { getRegistryRoleHistoryForAccountQueryOptions } from '../../hooks/useRegistryRoleHistoryForAccount'

type EnrichedEntry = RoleHistoryEntry & {
  sender: Address | null
}

type RegistryUserRoleHistoryProps = {
  registryAddress: Address
  /** The user being inspected. When null, the panel renders nothing. */
  account: Address | null
}

const columns: ColumnDef<EnrichedEntry>[] = [
  {
    id: 'date',
    header: () => <span className="text-muted-foreground">Date</span>,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {formatTimestamp(BigInt(row.original.timestamp))}
      </span>
    ),
  },
  {
    id: 'transaction',
    header: () => <span className="text-muted-foreground">Transaction</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs">
          RolesChanged
        </Badge>
        <BlockExplorerTxLink txHash={row.original.transactionHash} inline />
      </div>
    ),
  },
  {
    id: 'from',
    header: () => <span className="text-muted-foreground">From</span>,
    cell: ({ row }) =>
      row.original.sender ? (
        <AddressDisplay address={row.original.sender} />
      ) : (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ),
  },
]

/**
 * Per-user role-change history embedded in the Edit User sheet. Lists every
 * `EACRolesChanged` event on this registry's ROOT_RESOURCE for the given
 * account — the audit trail for the role grants and revokes the sheet
 * actually manages. Non-role events on the registry are out of scope here.
 *
 * Uses the shared `DataTable` for styling parity with `RegistryRolesTable`
 * and `EntityBadge`-backed display components (`BlockExplorerTxLink`,
 * `AddressDisplay`) so chips look identical to the rest of the app.
 */
export const RegistryUserRoleHistory = ({
  registryAddress,
  account,
}: RegistryUserRoleHistoryProps) => {
  const { data, isLoading, error } = useQuery({
    ...getRegistryRoleHistoryForAccountQueryOptions({
      registryAddress,
      account: account ?? zeroAddress,
    }),
    enabled: Boolean(account),
  })

  const transactionHashes = (data ?? []).map((e) => e.transactionHash)
  const { data: sendersMap } = useTransactionSenders({ transactionHashes })

  const rows: EnrichedEntry[] = (data ?? []).map((entry) => ({
    ...entry,
    sender: sendersMap?.get(entry.transactionHash) ?? null,
  }))

  if (!account) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">History</h2>
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      )}
      {error && (
        <p className="text-sm text-danger-text">
          Failed to load history
          {error.cause?.message ? `: ${error.cause.message}` : ''}
        </p>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No role changes recorded for this user yet.
        </p>
      )}
      {!isLoading && !error && rows.length > 0 && (
        <div className="[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent">
          <DataTable columns={columns} data={rows} />
        </div>
      )}
    </section>
  )
}
