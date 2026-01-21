import { useMemo } from 'react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  extractBlocksNeedingTimestamps,
  extractTransactionHashes,
  mergeAndSortEvents,
  transformV1EventsToCommon,
  transformV2EventsToCommon,
  type V1Events,
  type V2Event,
} from '@/utils/history/transformAddressHistory'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'

type AddressHistoryData = {
  v1Events?: V1Events
  v2Events?: V2Event[]
}

export const AddressHistoryDataTable = ({
  address,
  history,
}: {
  address: string
  history: AddressHistoryData
}) => {
  // Transform V1 events to common format
  const v1EventsData = useMemo(
    () => transformV1EventsToCommon(history.v1Events),
    [history.v1Events],
  )

  // Transform V2 events to common format
  const v2EventsData = useMemo(
    () => transformV2EventsToCommon(history.v2Events),
    [history.v2Events],
  )

  // Merge V1 and V2 events
  const eventsData = useMemo(
    () => mergeAndSortEvents(v1EventsData, v2EventsData),
    [v1EventsData, v2EventsData],
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
    return <LoadingMessage />
  }
  if (isLoadingTimestamps) {
    return <LoadingMessage />
  }
  if (isLoadingSenders) {
    return <LoadingMessage />
  }

  if (timestampsError) {
    const message =
      timestampsError.cause?.message || 'Could not load timestamps.'
    return (
      <ErrorMessage title="Error loading timestamps" description={message} />
    )
  }
  if (sendersError) {
    const message =
      sendersError.cause?.message || 'Could not load transaction senders.'
    return (
      <ErrorMessage
        title="Error loading transaction senders"
        description={message}
      />
    )
  }

  return (
    <EventsDataTable<ENSEvent>
      data={eventsDataWithTimestampsAndSenders}
      name={address}
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
