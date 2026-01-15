import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import { useMemo } from 'react'
import type { Hash } from 'viem'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  type ENSEvent,
  transformHistoryToEvents,
} from '@/utils/history/transformHistoryToEvents'

export const HistoryDataTable = ({
  name,
  history,
}: {
  name: string
  history: GetNameHistoryReturnType
}) => {
  // Transform ENS history to generic events format
  const eventsData = useMemo(() => transformHistoryToEvents(history), [history])

  // Fetch timestamps for all transactions
  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: eventsData.map((tx) => BigInt(tx.blockNumber)),
  })

  // Fetch senders for all transactions
  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: eventsData.map((tx) => tx.transactionID as Hash),
  })

  // Add timestamps and senders to the events data
  const eventsDataWithTimestampsAndSenders = useMemo(
    () => enrichEventsWithMetadata(eventsData, timestampsData, sendersData),
    [eventsData, timestampsData, sendersData],
  )

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

  return (
    <EventsDataTable<ENSEvent>
      data={eventsDataWithTimestampsAndSenders}
      name={name}
      enableSidebar={true}
      enableFilters={true}
      enableSearch={true}
      defaultNetwork={{
        name: 'Sepolia',
        icon: '/icons/eth.svg',
      }}
    />
  )
}
