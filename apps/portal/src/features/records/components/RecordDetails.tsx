import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { match } from 'ts-pattern'
import type { Hash } from 'viem'
import { useEnsResolver } from 'wagmi'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { InfoCard, InfoRow } from '@/components/InfoCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  getRecordHistoryQueryOptions,
  type RecordHistoryEvent,
  type RecordHistoryParameters,
} from '@/features/records/hooks/useRecordHistory'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import type { NameRecord } from './RecordsTable/columns'

const RecordDetailsView = ({ record }: { record: NameRecord }) => {
  switch (record.type) {
    case 'address':
      return (
        <div className="flex flex-col">
          <InfoRow label="Coin Type">
            <span className="font-mono">
              {record.id}{' '}
              <span className="font-sans text-caps text-muted-foreground">
                {record.key}
              </span>
            </span>
          </InfoRow>
          <InfoRow label="Value">
            <EntityBadge
              type="content"
              variant="default"
              format="wrap"
              copyValue={record.value}
            >
              {record.value}
            </EntityBadge>
          </InfoRow>
        </div>
      )
    case 'text':
      return (
        <div className="flex flex-col">
          <InfoRow label="Key">
            <span className="font-mono">{record.key}</span>
          </InfoRow>
          <InfoRow label="Value">
            <EntityBadge
              type="content"
              variant="default"
              format="wrap"
              copyValue={record.value}
            >
              {record.value}
            </EntityBadge>
          </InfoRow>
        </div>
      )
    case 'contentHash':
    case 'abi':
      return (
        <InfoCard title={record.type === 'abi' ? 'ABI' : 'Content hash'}>
          <InfoRow label="Value">
            <EntityBadge
              type="content"
              variant="default"
              format="wrap"
              copyValue={record.value}
            >
              {record.value}
            </EntityBadge>
          </InfoRow>
        </InfoCard>
      )
    default:
      return <div>Unknown record type</div>
  }
}

interface ResolverViewProps {
  name: string
}

const ResolverView = ({ name }: ResolverViewProps) => {
  const {
    data: resolverAddress,
    error,
    isLoading,
  } = useEnsResolver({
    name,
    universalResolverAddress,
  })

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching the resolver. Please refresh the page."
      />
    )
  if (!resolverAddress) return <div>No resolver set</div>

  return (
    <InfoCard title="Resolver">
      <InfoRow label="Resolver address">
        <EntityBadge
          type="content"
          variant="default"
          format="wrap"
          copyValue={resolverAddress}
        >
          {resolverAddress}
        </EntityBadge>
      </InfoRow>
    </InfoCard>
  )
}

/** The bigname record key (or family) a table row's history is filed under. */
const recordHistoryKey = (record: NameRecord): RecordHistoryParameters['key'] =>
  match(record)
    .returnType<RecordHistoryParameters['key']>()
    .with({ type: 'address' }, ({ id }) => `addr:${id}`)
    .with({ type: 'text' }, ({ key }) => `text:${key}`)
    .with({ type: 'contentHash' }, () => 'contenthash')
    .with({ type: 'abi' }, () => 'abi')
    .exhaustive()

const columns: ColumnDef<RecordHistoryEvent>[] = [
  {
    header: 'Date',
    accessorKey: 'timestamp',
    cell({ row }) {
      const date = new Date(Number(row.original.timestamp) * 1000)
      return (
        <span className="font-mono">
          {new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
            .format(date)
            .replace(/-/g, '/')}
        </span>
      )
    },
  },
  {
    header: 'Transaction',
    accessorKey: 'transactionID',
    cell({ row }) {
      return <BlockExplorerTxLink txHash={row.original.transactionID as Hash} />
    },
  },
  {
    header: 'Type',
    accessorKey: 'type',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return <span className="font-mono">{value}</span>
    },
  },
  {
    header: 'Value',
    accessorKey: 'value',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string | undefined
      return <span className="font-mono">{value ?? '-'}</span>
    },
  },
]

interface HistoryViewProps {
  name: string
  record: NameRecord
}

/**
 * Every write to this record, from every resolver the name has pointed at, in
 * ENSv1 and ENSv2 alike — one bigname history read filtered to the record's key.
 */
const HistoryView = ({ name, record }: HistoryViewProps) => {
  const { data, isLoading, error } = useQuery(
    getRecordHistoryQueryOptions({ name, key: recordHistoryKey(record) }),
  )

  if (isLoading) return <LoadingSpinner title="Loading history..." />
  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching history. Please refresh the page."
      />
    )
  }

  const events = data ?? []

  return (
    <div className="rounded-sm bg-background overflow-hidden">
      <div className="pb-3">
        <span className="text-caps leading-none text-foreground">History</span>
      </div>
      <div>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            No history available for this record.
          </p>
        ) : (
          <DataTable data={events} columns={columns} />
        )}
      </div>
    </div>
  )
}

interface RecordDetailsProps {
  record: NameRecord
  name: string
}

export const RecordDetails = ({ record, name }: RecordDetailsProps) => {
  return (
    <div className="p-6 flex flex-col gap-6 [&_[data-slot=info-card-title]]:px-0 [&_[data-slot=info-row]]:px-0">
      <RecordDetailsView record={record} />
      <ResolverView name={name} />
      <HistoryView {...{ name, record }} />
    </div>
  )
}
