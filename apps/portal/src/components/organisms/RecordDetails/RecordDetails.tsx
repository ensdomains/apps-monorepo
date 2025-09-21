import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { SearchIcon, TrashIcon } from 'lucide-react'
import { useChainId, useEnsResolver } from 'wagmi'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import {
  CCIPGatewayURLView,
  ResolverField,
} from '@/components/resolver/ResolverField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetHeader } from '@/components/ui/sheet'
import { useCanEditRecords } from '@/features/profile/hooks/useCanEditRecords'
import { getRecordHistoryQueryOptions } from '@/features/profile/hooks/useRecordHistory'
import { recordTypeToSubgraphKey } from '@/utils/subgraph/recordTypeToSubgraphKey'
import type { WithTimestamp } from '@/utils/types'
import type { NameRecord } from '../RecordsTable/columns'
import { filterRecordHistoryByRecord } from '@/utils/subgraph/filterRecordHistoryByRecord'
import { ExternalLink } from 'react-external-link'

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
            <SearchIcon height={24} width={24} />
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

const ResolverView = ({ name }: { name: string }) => {
  const { data: resolverAddress, error, isLoading } = useEnsResolver({ name })
  const chainId = useChainId()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!resolverAddress) return <div>No data</div>

  if (chainId === 1) {
    return (
      <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg">
        <h3 className="text-2xl font-medium">Resolver</h3>
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ResolverField label="Resolver address" value={resolverAddress} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg">
      <h3 className="text-2xl font-medium">Resolver</h3>
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResolverField
          label="Mainnet contract address"
          value={resolverAddress}
        />
        <ResolverField
          label="Namechain contract address"
          value={resolverAddress}
        />
        <CCIPGatewayURLView />
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
          <span className="font-mono underline decoration-dashed underline-offset-4 hover:text-gray-600">{value}</span>
        </ExternalLink>
      )
    },
  },
  {
    accessorFn: (val) => {
      console.log(val)
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


  if (isLoading) return <div>Loading...</div>

  if (error) {
    if (error._tag === 'Wagmi/ClientError')
      return <div>Error connecting to Ethereum</div>
    return <div>Error: {error.cause?.message}</div>
  }

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg overflow-y-scroll">
      <h3 className="text-2xl font-medium">History</h3>
      <DataTable data={filterRecordHistoryByRecord(history || [], record)} columns={columns} />
    </div>
  )
}

const RecordDetailsView = ({
  record,
  name,
}: {
  record: NameRecord
  name: string
}) => {
  const { data: canEditRecords } = useCanEditRecords({ name })

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
    <div className="py-6 px-8 flex flex-col gap-6 h-screen">
      <SheetHeader className="flex flex-row justify-between">
        <h2 className="font-sans text-[28px] font-medium">
          <span className="capitalize">{record.type}</span> record
        </h2>
        {canEditRecords && (
          <Button variant="secondary" type="button" className="bg-gray-200">
            <TrashIcon /> Delete record
          </Button>
        )}
      </SheetHeader>
      <RecordDetailsView {...{ record, name }} />
      <ResolverView name={name} />
      <HistoryView {...{ name, record }} />
    </div>
  )
}
