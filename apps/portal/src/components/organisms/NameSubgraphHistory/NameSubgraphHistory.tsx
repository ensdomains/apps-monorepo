import { useQuery } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import {
  type GetNameHistoryError,
  getNameHistoryQueryOptions,
} from '@/features/profile/hooks/useNameHistory'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import {
  groupEventsByTransactionId,
  type SubgraphEvent,
} from '@/utils/history/groupEventsByTransactionId'

type Category = 'domain' | 'registration' | 'resolver'

interface NameSubgraphHistoryProps {
  name: string
  category?: Category
}

const categoryToEventType = (c: Category): `${Category}Events` => {
  return `${c}Events`
}

const NameSubgraphHistoryTable = ({
  name,
  data: history,
  category,
}: {
  name: string
  data: SubgraphEvent[]
  category: Category
}) => {
  const groupedData = groupEventsByTransactionId(history, category)

  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
  })

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (isLoadingTimestamps && isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction data..." />
  }
  if (isLoadingTimestamps) {
    return <LoadingSpinner title="Loading timestamps..." />
  }
  if (isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction senders..." />
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
      enableFilters={false}
      enableSearch={false}
      enableTransactionCount={false}
      enableSidebar={false}
      data={dataWithTimestampsAndSenders}
      name={name}
    />
  )
}

export const NameSubgraphHistory = ({
  name,
  category = 'resolver',
}: NameSubgraphHistoryProps) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery(getNameHistoryQueryOptions({ name }))

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error)
    return <div>Error: {(error as GetNameHistoryError).cause?.message}</div>

  const eventType = categoryToEventType(category)

  const data = history?.[eventType]

  if (!data)
    return (
      <div className="flex flex-col gap-1 p-6 border border-gray-300 rounded-lg w-full">
        <div>
          <h2 className="text-[26px] font-medium">History</h2>
        </div>
        <div>No recent activity.</div>
      </div>
    )

  return (
    <div className="flex flex-col gap-1 p-6 border border-gray-300 rounded-lg w-full">
      <div>
        <h2 className="text-[26px] font-medium">History</h2>
      </div>
      <NameSubgraphHistoryTable {...{ name, data, category }} />
    </div>
  )
}
