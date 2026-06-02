import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { Address, Hash } from 'viem'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataTable } from '@/components/DataTable'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Badge } from '@/components/ui/badge'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import {
  getRegistryEventsForAccountQueryOptions,
  type RegistryEvent,
} from '../../hooks/useRegistryEventsForAccount'

// Strip the indexer's `EAC` prefix so the chip reads "RolesChanged" rather
// than the more technical "EACRolesChanged". Other event types pass through
// unchanged.
const formatEventType = (type: string) => type.replace(/^EAC/, '')

type EnrichedEvent = RegistryEvent & {
  sender: Address | null
}

type RegistryUserActivityProps = {
  registryAddress: Address
  /** The user being inspected. When null, the panel renders nothing. */
  account: Address | null
}

export const RegistryUserActivity = ({
  registryAddress,
  account,
}: RegistryUserActivityProps) => {
  const { data, isLoading, error } = useQuery({
    ...getRegistryEventsForAccountQueryOptions({
      registryAddress,
      account: account ?? (`0x${'0'.repeat(40)}` as Address),
    }),
    enabled: Boolean(account),
  })

  const transactionHashes = useMemo<Hash[]>(
    () => (data ?? []).map((e) => e.transactionHash),
    [data],
  )
  const { data: sendersMap } = useTransactionSenders({ transactionHashes })

  const rows = useMemo<EnrichedEvent[]>(
    () =>
      (data ?? []).map((event) => ({
        ...event,
        sender: sendersMap?.get(event.transactionHash) ?? null,
      })),
    [data, sendersMap],
  )

  const columns = useMemo<ColumnDef<EnrichedEvent>[]>(
    () => [
      {
        id: 'date',
        header: () => <span className="text-muted-foreground">Date</span>,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground whitespace-nowrap py-4">
            {formatTimestamp(BigInt(row.original.timestamp))}
          </div>
        ),
      },
      {
        id: 'transaction',
        header: () => (
          <span className="text-muted-foreground">Transaction</span>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-start justify-start flex-wrap">
            <BlockExplorerTxLink txHash={row.original.transactionHash} inline />
            <span>{formatEventType(row.original.type)}</span>
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
    ],
    [],
  )

  if (!account) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase">History</h2>
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      )}
      {error && (
        <p className="text-sm text-danger-text">
          Failed to load history
          {(error as { cause?: { message?: string } }).cause?.message
            ? `: ${(error as { cause?: { message?: string } }).cause?.message}`
            : ''}
        </p>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No activity recorded for this user yet.
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
