import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import type { WithTimestamp } from '@/utils/types'
import { useBlockTimestamps } from '../hooks/useBlockTimestamps'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'

const _columns: ColumnDef<
  WithTimestamp<BaseResolverEvent | BaseDomainEvent | BaseRegistrationEvent>
>[] = [
  {
    accessorKey: 'timestamp',
    cell({ column, row }) {
      const value = row.getValue(column.id) as bigint

      const date = new Date(Number(value) * 1000)

      return (
        <span>
          {date.toLocaleDateString(undefined, {
            month: 'long',
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
  },
  {
    accessorKey: 'transactionID',
    header: 'Transaction',
    cell({ column, row }) {
      const value = row.getValue(column.id) as string
      const displayName = `${value.slice(0, 6)}…${value.slice(-4)}`

      return (
        <CopyableRecord
          href={`https://etherscan.io/tx/${value}`}
          className="w-full max-w-72 lg:max-w-80 xl:max-w-max"
          value={value}
          displayValue={<span>{displayName}</span>}
        />
      )
    },
  },
]

const RecentActivityTable = ({
  events,
  name,
}: {
  events: (BaseResolverEvent | BaseRegistrationEvent | BaseDomainEvent)[]
  name: string
}) => {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({ blocks: events.map((e) => BigInt(e.blockNumber)) })

  if (isLoading) return <div>Fetching block timestamps...</div>
  if (error || !timestamps)
    return <div>Failed to fetch block timestamps: {error?.message}</div>

  const groupedData = groupEventsByTransactionId(events, 'resolver')

  const dataWithTimestamps = groupedData.map((tx) => ({
    ...tx,
    timestamp: timestamps.get(BigInt(tx.blockNumber)),
  }))

  return (
    <EventsDataTable
      enableTransactionCount={false}
      enableFilters={false}
      enableSearch={false}
      enableSidebar={false}
      name={name}
      data={dataWithTimestamps}
    />
  )
}

interface RecentActivityProps {
  name: string
}

export const RecentActivity = ({ name }: RecentActivityProps) => {
  const {
    data: events,
    isLoading,
    error,
  } = useQuery(
    getNameHistoryQueryOptions({ name, first: 3, orderDirection: 'desc' }),
  )

  if (isLoading) {
    return <LoadingSpinner title="Loading..." />
  }

  if (error) {
    return <div>Name History Error: {error.cause?.message}</div>
  }

  if (!events) {
    return <div>No recent activity</div>
  }

  return (
    <div className="flex flex-col  gap-6">
      <h3 className="font-medium text-2xl">History</h3>
      <div className="border border-gray-300 p-6 rounded-lg">
        <RecentActivityTable
          name={name}
          events={[
            ...events.domainEvents,
            ...(events.registrationEvents || []),
            ...(events.resolverEvents || []),
          ]}
        />
      </div>
    </div>
  )
}
