import type { GetRecordHistoryParameters } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Hash } from 'viem'
import { zeroAddress } from 'viem'
import type { Address } from 'viem/accounts'
import { useEnsResolver } from 'wagmi'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataRow } from '@/components/DataRow'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { ResolverField } from '@/features/resolver/components/ResolverField'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import {
  filterV2EventsByRecord,
  type HistoryEvent,
  sortHistoryEvents,
  transformV1Events,
  transformV2Events,
} from '@/utils/history/transformRecordHistory'
import { filterRecordHistoryByRecord } from '@/utils/subgraph/filterRecordHistoryByRecord'
import { recordTypeToSubgraphKey } from '@/utils/subgraph/recordTypeToSubgraphKey'
import type { ProtocolVersion } from '@/utils/types'
import type { NameRecord } from './RecordsTable/columns'

const RecordDetailsView = ({ record }: { record: NameRecord }) => {
  switch (record.type) {
    case 'address':
      return (
        <div className="flex flex-col gap-4 p-6 border border-border rounded-lg">
          <DataRow label="Coin Type">
            <span className="font-mono">
              {record.id}{' '}
              <span className="font-sans text-quartz-500 uppercase">
                {record.key}
              </span>
            </span>
          </DataRow>
          <DataRow label="Value">
            <CopyableRecord
              value={record.value}
              truncate={false}
              textClassName="break-all"
            />
          </DataRow>
        </div>
      )
    case 'text':
      return (
        <div className="flex flex-col gap-4 p-6 border border-border rounded-lg">
          <DataRow label="Key">
            <span className="font-mono">{record.key}</span>
          </DataRow>
          <DataRow label="Value">
            <CopyableRecord
              value={record.value}
              truncate={false}
              textClassName="break-all"
            />
          </DataRow>
        </div>
      )
    case 'contentHash':
    case 'abi':
      return (
        <div className="flex flex-col gap-4 p-6 border border-border rounded-lg">
          <DataRow label="Value">
            <CopyableRecord
              value={record.value}
              truncate={false}
              textClassName="break-all"
            />
          </DataRow>
        </div>
      )
    default:
      return <div>Unknown record type</div>
  }
}

interface UnderlyingResolverProps {
  resolverAddress: Address
  name: string
}

const UnderlyingResolver = ({
  resolverAddress,
  name,
}: UnderlyingResolverProps) => {
  const { data, error, isLoading } = useQuery(
    getUnderlyingAddressQueryOptions({ resolverAddress, name }),
  )

  if (error) return <div>Error: ${error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data || data[0] === zeroAddress) {
    return (
      <ResolverField
        label="Universal Resolver address"
        value={resolverAddress}
      />
    )
  }

  return (
    <>
      <ResolverField
        label="Universal Resolver address"
        value={resolverAddress}
      />
      <ResolverField
        label={data[1] ? 'Namechain address' : 'Mainnet address'}
        value={data[0]}
      />
    </>
  )
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
  })

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error) return <div>Error: {error.message}</div>
  if (!resolverAddress) return <div>No data</div>

  return (
    <div className="flex flex-col gap-6 p-6 border border-border rounded-lg">
      <h3 className="text-2xl font-medium">Resolver</h3>
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnderlyingResolver {...{ name, resolverAddress }} />
      </div>
    </div>
  )
}

const columns: ColumnDef<HistoryEvent>[] = [
  {
    header: 'Date',
    accessorKey: 'timestamp',
    cell({ row }) {
      const timestamp = row.original.timestamp
      if (!timestamp) {
        // Fallback to block number if no timestamp
        return (
          <span className="font-mono text-quartz-500">
            Block {row.original.blockNumber}
          </span>
        )
      }
      const date = new Date(timestamp * 1000)
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
    accessorKey: 'transactionHash',
    cell({ row }) {
      const txHash = row.original.transactionHash
      return <BlockExplorerTxLink txHash={txHash as Hash} />
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
  protocolVersion?: ProtocolVersion
}

const HistoryView = ({ name, record, protocolVersion }: HistoryViewProps) => {
  const isV1 = protocolVersion === 'ENSv1'
  const isV2 = protocolVersion === 'ENSv2'

  // Only query V1 history for V1 names, V2 history for V2 names
  // If network is undefined, we don't know which to query yet
  const v1HistoryQuery = useQuery({
    ...getRecordHistoryQueryOptions({
      name,
      key: recordTypeToSubgraphKey(
        record.type,
      ) as GetRecordHistoryParameters['key'],
    }),
    enabled: isV1,
  })

  const v2HistoryQuery = useQuery({
    ...getV2NameHistoryQueryOptions({ name }),
    enabled: isV2,
  })

  // Filter V1 events (need to do this before fetching timestamps)
  const filteredV1Events = isV1
    ? filterRecordHistoryByRecord(v1HistoryQuery.data || [], record)
    : []

  // Fetch timestamps for V1 events (they don't include timestamps)
  const v1BlockNumbers = filteredV1Events.map((e) => BigInt(e.blockNumber))
  const { data: blockTimestamps, isLoading: isLoadingTimestamps } =
    useBlockTimestamps({
      blocks: v1BlockNumbers,
      enabled: isV1 && v1BlockNumbers.length > 0,
    })

  // Handle loading and error states
  if (!protocolVersion) {
    return <LoadingSpinner title="Loading..." />
  }

  if (isV1) {
    if (v1HistoryQuery.isLoading) {
      return <LoadingSpinner title="Loading history..." />
    }
    if (v1BlockNumbers.length > 0 && isLoadingTimestamps) {
      return <LoadingSpinner title="Loading timestamps..." />
    }
    if (v1HistoryQuery.error) {
      return (
        <div>
          History Error:{' '}
          {v1HistoryQuery.error.cause?.message || v1HistoryQuery.error.message}
        </div>
      )
    }
  } else {
    if (v2HistoryQuery.isLoading) {
      return <LoadingSpinner title="Loading history..." />
    }
    if (v2HistoryQuery.error) {
      return (
        <div>
          History Error:{' '}
          {v2HistoryQuery.error.cause?.message || v2HistoryQuery.error.message}
        </div>
      )
    }
  }

  // Transform V1 events with fetched timestamps
  const v1Events = isV1
    ? transformV1Events(filteredV1Events, blockTimestamps)
    : []

  // Filter and transform V2 events (they already have timestamps)
  const filteredV2Events = isV2
    ? filterV2EventsByRecord(v2HistoryQuery.data || [], record)
    : []
  const v2Events = isV2 ? transformV2Events(filteredV2Events) : []

  // Merge and sort by timestamp (descending), fallback to block number
  const allEvents = sortHistoryEvents([...v1Events, ...v2Events])

  const hasNoHistory = allEvents.length === 0

  return (
    <div className="flex flex-col gap-6 p-6 border border-border rounded-lg">
      <h3 className="text-2xl font-medium">History</h3>
      {hasNoHistory ? (
        <p className="text-quartz-500 text-sm py-4">
          No history available for this record.
        </p>
      ) : (
        <DataTable data={allEvents} columns={columns} />
      )}
    </div>
  )
}

interface RecordDetailsProps {
  record: NameRecord
  name: string
  protocolVersion?: ProtocolVersion
}

export const RecordDetails = ({
  record,
  name,
  protocolVersion,
}: RecordDetailsProps) => {
  return (
    <div className="p-6 flex flex-col gap-6">
      <RecordDetailsView record={record} />
      <ResolverView name={name} />
      <HistoryView {...{ name, record, protocolVersion }} />
    </div>
  )
}
