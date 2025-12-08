import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { useBlockTimestamps } from '../hooks/useBlockTimestamps'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { useTransactionSenders } from '../hooks/useTransactionSenders'

const RecentActivityTable = ({
  events,
  name,
}: {
  events: (BaseResolverEvent | BaseRegistrationEvent | BaseDomainEvent)[]
  name: string
}) => {
  const groupedData = groupEventsByTransactionId(events, 'resolver')

  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({ blocks: events.map((e) => BigInt(e.blockNumber)) })

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (isLoadingTimestamps && isLoadingSenders) {
    return <div>Loading transaction data...</div>
  }
  if (isLoadingTimestamps) {
    return <div>Loading timestamps...</div>
  }
  if (isLoadingSenders) {
    return <div>Loading transaction senders...</div>
  }

  if (timestampsError) {
    return <div>Error loading timestamps: {timestampsError.cause?.message}</div>
  }
  if (sendersError) {
    return (
      <div>
        Error loading transaction senders: {sendersError.cause?.message}
      </div>
    )
  }

  if (!timestampsData || !sendersData) {
    return <div>No data available</div>
  }

  const dataWithTimestampsAndSenders = groupedData.map((tx) => ({
    ...tx,
    timestamp: timestampsData.get(BigInt(tx.blockNumber)),
    from: sendersData.get(tx.transactionID as Hash) || tx.from,
  }))

  return (
    <EventsDataTable
      enableTransactionCount={false}
      enableFilters={false}
      enableSearch={false}
      enableSidebar={false}
      name={name}
      data={dataWithTimestampsAndSenders}
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
