import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { SearchIcon, TrashIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { zeroAddress } from 'viem'
import type { Address } from 'viem/accounts'
import { useEnsResolver } from 'wagmi'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { ResolverField } from '@/components/resolver/ResolverField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { filterRecordHistoryByRecord } from '@/utils/subgraph/filterRecordHistoryByRecord'
import { recordTypeToSubgraphKey } from '@/utils/subgraph/recordTypeToSubgraphKey'
import type { NameRecord } from './RecordsTable/columns'

const AddressRecordValue = ({
  record,
  canEditRecords,
}: {
  record: Extract<NameRecord, { type: 'address' }>
  canEditRecords?: boolean
}) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-200 rounded-lg w-full items-end">
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

const TextRecordValue = ({
  record,
  canEditRecords,
}: {
  record: Extract<NameRecord, { type: 'text' }>
  canEditRecords?: boolean
}) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-200 rounded-lg w-full items-end">
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

const ContentHashValue = ({
  record,
  canEditRecords,
}: {
  record: Extract<NameRecord, { type: 'contentHash' }>
  canEditRecords?: boolean
}) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-200 rounded-lg w-full items-end">
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

const UnderlyingResolver = ({
  resolverAddress,
  name,
}: {
  resolverAddress: Address
  name: string
}) => {
  const { data, error, isLoading } = useQuery(
    getUnderlyingAddressQueryOptions({ resolverAddress, name }),
  )

  if (error) return <div>Error: ${error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

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

const ResolverView = ({ name }: { name: string }) => {
  const {
    data: resolverAddress,
    error,
    isLoading,
  } = useEnsResolver({
    name,
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!resolverAddress) return <div>No data</div>

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg">
      <h3 className="text-2xl font-medium">Resolver</h3>
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnderlyingResolver {...{ name, resolverAddress }} />
      </div>
    </div>
  )
}

const columns: ColumnDef<ReturnResolverEvent>[] = [
  {
    header: 'Block',
    accessorKey: 'blockNumber',
    cell({ column, row }) {
      const value = row.getValue(column.id) as number

      return (
        <ExternalLink href={`https://etherscan.io/block/${value}`}>
          <span className="font-mono underline decoration-dashed underline-offset-4 hover:text-gray-600">
            {value}
          </span>
        </ExternalLink>
      )
    },
  },
  {
    accessorFn: (val) => {
      switch (val.type) {
        case 'ContenthashChanged':
          return val.contentHash
        case 'TextChanged':
          return `${val.key}: ${val.value ?? 'null'}`
        case 'AddrChanged':
        case 'MulticoinAddrChanged':
          return val.addr
      }
    },
    header: 'Value',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return <span className="font-mono">{value}</span>
    },
  },
]

const HistoryView = ({
  name,
  record,
}: {
  name: string
  record: NameRecord
}) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery(
    getRecordHistoryQueryOptions({
      name,
      key: recordTypeToSubgraphKey(record.type),
    }),
  )

  if (error) {
    return <div>History Error: {error.cause?.message || error.message}</div>
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg overflow-y-scroll">
      <h3 className="text-2xl font-medium">History</h3>
      <DataTable
        data={filterRecordHistoryByRecord(history || [], record)}
        columns={columns}
      />
    </div>
  )
}

const RecordDetailsView = ({
  record,
  canEditRecords,
}: {
  record: NameRecord
  canEditRecords?: boolean
}) => {
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

export const RecordDetails = ({
  record,
  name,
}: {
  record: NameRecord
  name: string
}) => {
  const { data: canEditRecords } = useCanEditRecords({ name })

  return (
    <div className="p-6 flex flex-col gap-6 h-screen">
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
      <HistoryView {...{ name, record }} />
    </div>
  )
}
