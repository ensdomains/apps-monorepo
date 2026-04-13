import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import type { Hash } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { Button } from '@/components/ui/button'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { LoadingMessage } from '../../../components/LoadingMessage'
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
    return <LoadingMessage title="Loading transaction data" />
  }
  if (isLoadingTimestamps) {
    return <LoadingMessage title="Loading timestamps" />
  }
  if (isLoadingSenders) {
    return <LoadingMessage title="Loading transaction senders" />
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
      enableNetwork={false}
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
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-row justify-between items-center">
          <h2 className="text-base font-normal">Recent activity</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/$name/history" params={{ name }}>
              <Clock className="size-4" />
              Full history
            </Link>
          </Button>
        </div>
        <div className="p-6 border border-border rounded-lg">
          No recent activity
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-row justify-between items-center">
        <h2 className="text-base font-normal">Recent activity</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/$name/history" params={{ name }}>
            <Clock className="size-4" />
            Full history
          </Link>
        </Button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
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
