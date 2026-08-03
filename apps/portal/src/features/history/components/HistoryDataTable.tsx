import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import { useMemo } from 'react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import type { V2NameHistoryEvent } from '@/features/profile/hooks/useV2NameHistory'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  extractBlocksNeedingTimestamps,
  extractTransactionHashes,
} from '@/utils/history/transformAddressHistory'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'
import { transformAndMergeNameHistory } from '@/utils/history/transformNameHistory'

type NameHistoryData = {
  v1History?: GetNameHistoryReturnType
  v2History?: V2NameHistoryEvent[]
}

export const HistoryDataTable = ({
  name,
  history,
}: {
  name: string
  history: NameHistoryData
}) => {
  // Transform and merge V1 and V2 events into a single sorted array
  const eventsData = useMemo(
    () => transformAndMergeNameHistory(history.v1History, history.v2History),
    [history.v1History, history.v2History],
  )

  // Extract blocks and transactions for metadata lookups
  const blocksNeedingTimestamps = useMemo(
    () => extractBlocksNeedingTimestamps(eventsData),
    [eventsData],
  )

  const transactionHashes = useMemo(
    () => extractTransactionHashes(eventsData),
    [eventsData],
  )

  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: blocksNeedingTimestamps,
  })

  // Fetch senders for all transactions
  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes,
  })

  // Add timestamps and senders to the events data
  const eventsDataWithTimestampsAndSenders = useMemo(
    () => enrichEventsWithMetadata(eventsData, timestampsData, sendersData),
    [eventsData, timestampsData, sendersData],
  )

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
        compact
        description="Error fetching timestamps. Please refresh the page."
      />
    )
  }
  if (sendersError) {
    return (
      <ErrorMessage
        compact
        description="Error fetching transaction senders. Please refresh the page."
      />
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
