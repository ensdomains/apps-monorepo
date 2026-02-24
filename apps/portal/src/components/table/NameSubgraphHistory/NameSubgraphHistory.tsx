import { useQuery } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import {
  type GetNameHistoryError,
  getNameHistoryQueryOptions,
} from '@/features/profile/hooks/useNameHistory'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  groupEventsByTransactionId,
  type SubgraphEvent,
} from '@/utils/history/groupEventsByTransactionId'

type Category = 'domain' | 'registration' | 'resolver'

interface NameSubgraphHistoryProps {
  name: string
  category?: Category
  /**
   * Optional pre-fetched V2 events data. When provided, skips V1 query and timestamp fetching.
   * V2 events already include timestamps from the indexer.
   */
  v2Events?: SubgraphEvent[]
  enableHeader?: boolean
}

const categoryToEventType = (c: Category): `${Category}Events` => {
  return `${c}Events`
}

const NameSubgraphHistoryTable = ({
  name,
  data: history,
  category,
  isV2,
}: {
  name: string
  data: SubgraphEvent[]
  category: Category
  isV2: boolean
}) => {
  const groupedData = groupEventsByTransactionId(history, category)

  // V2 events already have timestamps, so skip fetching for V2
  const hasTimestamps =
    isV2 && history.every((item) => item.timestamp !== undefined)

  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
    enabled: !hasTimestamps,
  })

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (!hasTimestamps && isLoadingTimestamps && isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction data..." />
  }
  if (!hasTimestamps && isLoadingTimestamps) {
    return <LoadingSpinner title="Loading timestamps..." />
  }
  if (isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction senders..." />
  }

  if (!hasTimestamps && timestampsError) {
    return <div>Error loading timestamps: {timestampsError.cause?.message}</div>
  }
  if (sendersError) {
    return (
      <div>
        Error loading transaction senders: {sendersError.cause?.message}
      </div>
    )
  }

  if (!hasTimestamps && !timestampsData) {
    return <div>No timestamp data available</div>
  }
  if (!sendersData) {
    return <div>No sender data available</div>
  }

  // For V2, create a timestamp map from the events themselves
  const finalTimestampsData = hasTimestamps
    ? new Map(
        // biome-ignore lint/style/noNonNullAssertion: <need to check this>
        history.map((event) => [BigInt(event.blockNumber), event.timestamp!]),
      )
    : timestampsData

  const dataWithTimestampsAndSenders = enrichEventsWithMetadata(
    groupedData,
    finalTimestampsData,
    sendersData,
  )

  return (
    <EventsDataTable
      enableFilters={false}
      enableSearch={false}
      enableTransactionCount={false}
      enableSidebar={false}
      enableNetwork={false}
      data={dataWithTimestampsAndSenders}
      name={name}
    />
  )
}

export const NameSubgraphHistory = ({
  name,
  category = 'resolver',
  v2Events,
  enableHeader = true,
}: NameSubgraphHistoryProps) => {
  const isV2 = !!v2Events

  // Only fetch V1 history if V2 events weren't provided
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    ...getNameHistoryQueryOptions({ name }),
    enabled: !isV2,
  })

  if (!isV2 && isLoading) return <LoadingSpinner title="Loading..." />
  if (!isV2 && error)
    return <div>Error: {(error as GetNameHistoryError).cause?.message}</div>

  // Use V2 events if provided, otherwise get from V1 history
  let data: SubgraphEvent[] | undefined

  if (isV2) {
    data = v2Events
  } else {
    const eventType = categoryToEventType(category)
    const rawData = history?.[eventType]
    // Convert null to undefined and cast V1 event types to SubgraphEvent
    data = rawData ? (rawData as SubgraphEvent[]) : undefined
  }

  if (!data || data.length === 0)
    return (
      <div className="flex flex-col gap-1 p-4 sm:p-6 border border-border rounded-lg w-full">
        {enableHeader && (
          <div>
            <h2 className="text-2xl font-medium">History</h2>
          </div>
        )}
        <div>No recent activity.</div>
      </div>
    )

  return (
    <div className="flex flex-col gap-1 p-4 sm:p-6 border border-border rounded-lg w-full">
      {enableHeader && (
        <div>
          <h2 className="text-2xl font-medium">History</h2>
        </div>
      )}
      <NameSubgraphHistoryTable {...{ name, data, category, isV2 }} />
    </div>
  )
}
