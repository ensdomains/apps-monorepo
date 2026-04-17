import type {
  BaseDomainEvent,
  BaseRegistrationEvent,
  BaseResolverEvent,
} from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import type { Hash } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { Button } from '@/components/ui/button'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  groupEventsByTransactionId,
  type SubgraphEvent,
} from '@/utils/history/groupEventsByTransactionId'
import { transformV2EventsToSubgraphFormat } from '@/utils/history/transformV2Events'
import type { ProtocolVersion } from '@/utils/types'
import { LoadingMessage } from '../../../components/LoadingMessage'
import { useBlockTimestamps } from '../hooks/useBlockTimestamps'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { useTransactionSenders } from '../hooks/useTransactionSenders'
import { getV2NameHistoryQueryOptions } from '../hooks/useV2NameHistory'

const RecentActivityShell = ({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-4 w-full">
    <div className="flex flex-row justify-between items-center">
      <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">
        History
      </h2>
      <Button variant="ghost" size="sm" asChild>
        <Link to="/$name/history" params={{ name }}>
          <Clock className="size-4" />
          Full history
        </Link>
      </Button>
    </div>
    {children}
  </div>
)

const NoRecentActivity = ({ name }: { name: string }) => (
  <RecentActivityShell name={name}>
    <div className="p-6 border-t border-border">No recent activity</div>
  </RecentActivityShell>
)

const V1RecentActivityTable = ({
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
    return (
      <ErrorMessage
        title="Error loading timestamps"
        description={timestampsError.cause?.message}
      />
    )
  }
  if (sendersError) {
    return (
      <ErrorMessage
        title="Error loading transaction senders"
        description={sendersError.cause?.message}
      />
    )
  }

  if (!timestampsData || !sendersData) {
    return <ErrorMessage title="No data available" />
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

const V2RecentActivityTable = ({
  events,
  name,
}: {
  events: SubgraphEvent[]
  name: string
}) => {
  const groupedData = groupEventsByTransactionId(events, 'resolver')

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (isLoadingSenders) {
    return <LoadingMessage title="Loading transaction senders" />
  }
  if (sendersError) {
    return (
      <ErrorMessage
        title="Error loading transaction senders"
        description={sendersError.cause?.message}
      />
    )
  }
  if (!sendersData) {
    return <ErrorMessage title="No sender data available" />
  }

  // V2 events already have timestamps from the indexer
  const timestampsData = new Map(
    // biome-ignore lint/style/noNonNullAssertion: V2 events always include timestamps
    events.map((event) => [BigInt(event.blockNumber), event.timestamp!]),
  )

  const dataWithTimestampsAndSenders = enrichEventsWithMetadata(
    groupedData,
    timestampsData,
    sendersData,
  )

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

const V1RecentActivity = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryQueryOptions({ name, first: 3, orderDirection: 'desc' }),
  )

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error)
    return (
      <ErrorMessage
        title="Error loading history"
        description={error.cause?.message}
      />
    )
  if (!data) return <NoRecentActivity name={name} />

  return (
    <RecentActivityShell name={name}>
      <div>
        <V1RecentActivityTable
          name={name}
          events={[
            ...data.domainEvents,
            ...(data.registrationEvents || []),
            ...(data.resolverEvents || []),
          ]}
        />
      </div>
    </RecentActivityShell>
  )
}

const V2RecentActivity = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getV2NameHistoryQueryOptions({ name, first: 3, orderDirection: 'desc' }),
  )

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error)
    return (
      <ErrorMessage
        title="Error loading history"
        description={error.cause?.message}
      />
    )
  if (!data || data.length === 0) return <NoRecentActivity name={name} />

  return (
    <RecentActivityShell name={name}>
      <div>
        <V2RecentActivityTable
          name={name}
          events={transformV2EventsToSubgraphFormat(data)}
        />
      </div>
    </RecentActivityShell>
  )
}

interface RecentActivityProps {
  name: string
  protocolVersion: ProtocolVersion
}

export const RecentActivity = ({
  name,
  protocolVersion,
}: RecentActivityProps) =>
  protocolVersion === 'ENSv2' ? (
    <V2RecentActivity name={name} />
  ) : (
    <V1RecentActivity name={name} />
  )
