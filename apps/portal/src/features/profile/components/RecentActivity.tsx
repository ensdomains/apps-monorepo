import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import type { WithTimestamp } from '@/utils/types'
import { useBlockTimestamps } from '../hooks/useBlockTimestamps'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'

const columns: ColumnDef<
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

interface RecentActivityTableProps {
  events: (BaseResolverEvent | BaseRegistrationEvent | BaseDomainEvent)[]
}

const RecentActivityTable = ({ events }: RecentActivityTableProps) => {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({ blocks: events.map((e) => BigInt(e.blockNumber)) })

  if (isLoading) return <div>Fetching block timestamps...</div>
  if (error || !timestamps)
    return <div>Failed to fetch block timestamps: {error?.message}</div>

  const data = events.map((ev) => ({
    ...ev,
    timestamp: timestamps.get(BigInt(ev.blockNumber)),
  }))

  return <DataTable data={data} columns={columns} />
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
    return <div>Error: {error.cause?.message}</div>
  }

  if (!events) {
    return <div>No recent activity</div>
  }

  return (
    <div className="flex flex-col border border-gray-300 p-6 gap-6 rounded-lg">
      <h3 className="font-medium text-2xl">Recent Activity</h3>
      <RecentActivityTable
        events={[
          ...events.domainEvents,
          ...(events.registrationEvents || []),
          ...(events.resolverEvents || []),
        ]}
      />
    </div>
  )
}
