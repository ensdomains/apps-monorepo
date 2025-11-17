import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { useBlockTimestamps } from '../hooks/useBlockTimestamps'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'

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
