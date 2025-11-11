import type {
  DomainEvent,
  RegistrationEvent,
  ResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem/accounts'
import { useEnsName } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import {
  type GetNameHistoryError,
  getNameHistoryQueryOptions,
} from '@/features/profile/hooks/useNameHistory'
import type { WithTimestamp } from '@/utils/types'

const resolverColumns: ColumnDef<WithTimestamp<ResolverEvent>>[] = [
  {
    accessorKey: 'timestamp',
    cell({ column, row }) {
      const value = row.getValue(column.id) as bigint

      const date = new Date(Number(value) * 1000)

      return (
        <span>
          {date.toLocaleDateString(undefined, {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })}
        </span>
      )
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return <span className="font-mono">{value}</span>
    },
  },
  {
    accessorKey: 'transactionID',
    header: 'Transaction',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return (
        <CopyableRecord
          href={`https://etherscan.io/tx/${value}`}
          className="w-full max-w-48 lg:max-w-64"
          value={value}
        />
      )
    },
  },
]

interface OwnerTableDisplayProps {
  owner: Address
}

const OwnerTableDisplay = ({ owner }: OwnerTableDisplayProps) => {
  const { data: ensName, isLoading } = useEnsName({
    address: owner,
  })

  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (ensName) {
    return <CopyableRecord value={ensName} />
  }
  return (
    <CopyableRecord className="w-full md:max-w-48 lg:max-w-72" value={owner} />
  )
}

const domainColumns: ColumnDef<WithTimestamp<DomainEvent>>[] = [
  {
    accessorKey: 'timestamp',
    cell({ column, row }) {
      const value = row.getValue(column.id) as bigint

      const date = new Date(Number(value) * 1000)

      return (
        <span>
          {date.toLocaleDateString(undefined, {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })}
        </span>
      )
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return <span className="font-mono">{value}</span>
    },
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell({ column, row }) {
      const value = row.getValue(column.id) as Address

      if (!value) return null

      return <OwnerTableDisplay owner={value} />
    },
  },
  {
    accessorKey: 'transactionID',
    header: 'Transaction',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      return (
        <CopyableRecord
          href={`https://etherscan.io/tx/${value}`}
          className="w-full max-w-48 lg:max-w-64"
          value={value}
        />
      )
    },
  },
]

type EventType = {
  resolverEvents: ResolverEvent
  domainEvents: DomainEvent
  registrationEvents: RegistrationEvent
}

interface EventTableProps<T extends keyof EventType> {
  events: EventType[T][]
  eventType: T
}

function EventTable<T extends keyof EventType>({
  events,
  eventType,
}: EventTableProps<T>) {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({ blocks: events.map((e) => BigInt(e.blockNumber)) })

  if (isLoading) return <div>Fetching block timestamps...</div>
  if (error || !timestamps)
    return <div>Failed to fetch block timestamps: {error?.message}</div>

  const data = events
    .map((ev) => ({
      ...ev,
      timestamp: timestamps.get(BigInt(ev.blockNumber)),
    }))
    .toReversed()

  switch (eventType) {
    case 'resolverEvents':
      return (
        <DataTable data={data as ResolverEvent[]} columns={resolverColumns} />
      )
    case 'domainEvents':
      return <DataTable data={data as DomainEvent[]} columns={domainColumns} />
    case 'registrationEvents':
      return <DataTable data={data as RegistrationEvent[]} columns={[]} />
  }
}

interface NameHistoryProps {
  name: string
  eventType?: keyof EventType
}

export const NameHistory = ({
  name,
  eventType = 'resolverEvents',
}: NameHistoryProps) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryQueryOptions({ name }),
  )

  if (isLoading) return <div>Loading...</div>
  if (error)
    return <div>Error: {(error as GetNameHistoryError).cause?.message}</div>

  return (
    <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
      <div>
        <h2 className="text-[26px] font-medium">History</h2>
      </div>
      <EventTable
        events={(data?.[eventType] || []) as EventType[typeof eventType][]}
        eventType={eventType}
      />
    </div>
  )
}
