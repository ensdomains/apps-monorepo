import type { GetRecordHistoryParameters } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { SearchIcon, TrashIcon } from 'lucide-react'
import { zeroAddress } from 'viem'
import type { Address } from 'viem/accounts'
import { useEnsResolver } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { ResolverField } from '@/features/resolver/components/ResolverField'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  filterV2EventsByRecord,
  type HistoryEvent,
  sortHistoryEvents,
  transformV1Events,
  transformV2Events,
} from '@/utils/history/transformRecordHistory'
import { filterRecordHistoryByRecord } from '@/utils/subgraph/filterRecordHistoryByRecord'
import { recordTypeToSubgraphKey } from '@/utils/subgraph/recordTypeToSubgraphKey'
import type { EnsNetworkName } from '@/utils/types'
import type { NameRecord } from './RecordsTable/columns'

interface AddressRecordValueProps {
  record: Extract<NameRecord, { type: 'address' }>
  canEditRecords?: boolean
}

const AddressRecordValue = ({
  record,
  canEditRecords,
}: AddressRecordValueProps) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-300 rounded-lg w-full items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="coin_type">Coin Type</Label>
        <div className="flex flex-row gap-2">
          <div className="border rounded-sm border-gray-300 min-w-44 flex flex-row items-center gap-2 px-3 text-center">
            <span className="font-mono">{record.id}</span>{' '}
            <span className="font-sans text-gray-500 uppercase">
              {record.key}
            </span>
          </div>
          <Button variant="input" className="p-3 w-max">
            <SearchIcon className="size-6" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        <Label>Value</Label>
        <Input
          className="border-gray-300 w-full font-mono disabled:opacity-100"
          disabled={!canEditRecords}
          value={record.value}
        />
      </div>
      {canEditRecords && (
        <Button variant="secondary" className="bg-gray-200">
          Update
        </Button>
      )}
    </div>
  )
}

interface TextRecordValueProps {
  record: Extract<NameRecord, { type: 'text' }>
  canEditRecords?: boolean
}

const TextRecordValue = ({ record, canEditRecords }: TextRecordValueProps) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-300 rounded-lg w-full items-end">
      <div className="flex flex-col gap-1 w-full">
        <Label htmlFor={record.key}>Text</Label>
        <Input
          id={record.key}
          className="border-gray-300 w-full font-mono disabled:opacity-100"
          disabled={!canEditRecords}
          value={record.value}
        />
      </div>{' '}
      {canEditRecords && (
        <Button variant="secondary" className="bg-gray-200">
          Update
        </Button>
      )}
    </div>
  )
}

interface ContentHashValueProps {
  record: Extract<NameRecord, { type: 'contentHash' }>
  canEditRecords?: boolean
}

const ContentHashValue = ({
  record,
  canEditRecords,
}: ContentHashValueProps) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-300 rounded-lg w-full items-end">
      <div className="flex flex-col gap-1 w-full">
        <Label htmlFor={record.type}>Content Hash</Label>
        <Input
          id={record.type}
          className="border-gray-300 w-full font-mono disabled:opacity-100"
          disabled={!canEditRecords}
          value={record.value}
        />
      </div>{' '}
      {canEditRecords && (
        <Button variant="secondary" className="bg-gray-200">
          Update
        </Button>
      )}
    </div>
  )
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
    <div className="flex flex-col gap-6 p-6 border border-gray-300 rounded-lg">
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
          <span className="font-mono text-gray-500">
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
      return (
        <CopyableRecord
          value={txHash}
          displayValue={
            <span className="font-mono">{truncateAddress(txHash)}</span>
          }
          className="text-sm underline decoration-dashed underline-offset-4"
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
        />
      )
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
  network?: EnsNetworkName
}

const HistoryView = ({ name, record, network }: HistoryViewProps) => {
  const isV1 = network === 'sepolia'
  const isV2 = network === 'namechainSepolia'

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
  if (!network) {
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
    <div className="flex flex-col gap-6 p-6 border border-gray-300 rounded-lg">
      <h3 className="text-2xl font-medium">History</h3>
      {hasNoHistory ? (
        <p className="text-gray-500 text-sm py-4">
          No history available for this record.
        </p>
      ) : (
        <DataTable data={allEvents} columns={columns} />
      )}
    </div>
  )
}

interface RecordDetailsViewProps {
  record: NameRecord
  canEditRecords?: boolean
}

const RecordDetailsView = ({
  record,
  canEditRecords,
}: RecordDetailsViewProps) => {
  switch (record.type) {
    case 'address':
      return <AddressRecordValue {...{ record, canEditRecords }} />
    case 'text':
      return <TextRecordValue {...{ record, canEditRecords }} />
    case 'contentHash':
      return <ContentHashValue {...{ record, canEditRecords }} />
    default:
      return <div>Unknown record type</div>
  }
}

interface RecordDetailsProps {
  record: NameRecord
  name: string
  network?: EnsNetworkName
}

export const RecordDetails = ({
  record,
  name,
  network,
}: RecordDetailsProps) => {
  const { data: canEditRecords } = useCanEditRecords({ name })

  return (
    <div className="p-6 flex flex-col gap-6 min-h-0">
      <SheetHeader className="flex flex-row justify-between">
        <SheetTitle className="font-sans text-[28px] font-medium capitalize">
          {record.type} record
        </SheetTitle>
        {canEditRecords && (
          <Button variant="secondary" type="button" className="bg-gray-200">
            <TrashIcon /> Delete record
          </Button>
        )}
      </SheetHeader>
      <RecordDetailsView {...{ record, canEditRecords }} />
      <ResolverView name={name} />
      <HistoryView {...{ name, record, network }} />
    </div>
  )
}
