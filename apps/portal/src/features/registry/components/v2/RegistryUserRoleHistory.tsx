import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import type { RoleHistoryEntry } from '@/lib/roles/roleHistoryEntry'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
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
    header: 'Date',
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground whitespace-nowrap mt-4">
        {formatTimestamp(row.original.timestamp)}
      </div>
    ),
  },
  {
    id: 'transaction',
    header: 'Transaction',
    cell: ({ row }) => (
      <div className="space-y-1 flex flex-col">
        <BlockExplorerTxLink txHash={row.original.transactionHash} inline />
        <span className="text-sm text-muted-foreground">RoleChanged</span>
      </div>
    ),
  },
  {
    id: 'from',
    header: 'From',
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
      account: account ?? zeroAddress,
      fromBlock: ROLES_FROM_BLOCK,
      registryAddress,
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
      <HistorySectionHeader />
      {match({ isLoading, error, count: rows.length })
        .with({ isLoading: true }, () => (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ))
        .with({ error: P.nonNullable }, () => (
          <ErrorMessage
            compact
            description="Error fetching role history. Please refresh the page."
          />
        ))
        .with({ count: 0 }, () => (
          <NoResultsMessage
            title="No role changes yet"
            description="This user has no recorded role grants or revokes on this registry."
            className="mx-0 my-0"
          />
        ))
        .otherwise(() => (
          <div className="[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent">
            <DataTable columns={columns} data={rows} />
          </div>
        ))}
    </section>
  )
}
