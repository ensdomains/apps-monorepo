import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import { useListLoader } from '@/components/ListLoader/useListLoader'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import type { RoleHistoryEntry } from '@/lib/roles/roleChangeLogs'
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
        <span className="text-small text-muted-foreground">Loading…</span>
      ),
  },
]

const ROLE_HISTORY_INITIAL_COUNT = 10

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
      registryAddress,
    }),
    enabled: Boolean(account),
  })

  const entries = data ?? []
  const loader = useListLoader({
    initialCount: ROLE_HISTORY_INITIAL_COUNT,
    loaded: entries.length,
    resetKey: `${registryAddress}:${account}`,
  })

  const transactionHashes = entries.map((e) => e.transactionHash)
  const { data: sendersMap } = useTransactionSenders({ transactionHashes })

  const rows: EnrichedEntry[] = entries.slice(0, loader.shown).map((entry) => ({
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
            <ListLoader {...loader} className="pt-3" />
          </div>
        ))}
    </section>
  )
}
