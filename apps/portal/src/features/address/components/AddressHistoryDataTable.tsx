import { useMemo } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { PageHeading } from '@/components/PageHeading'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { enrichEventsWithMetadata } from '@/utils/history/enrichEventsWithMetadata'
import {
  extractBlocksNeedingTimestamps,
  extractTransactionHashes,
  groupAddressHistoryByName,
  type V1NameHistory,
  type V2NameHistory,
} from '@/utils/history/transformAddressHistory'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'
import { partitionAddressHistory } from '../nameAttribution'

type AddressHistoryData = {
  v1Events?: V1NameHistory[]
  v2Events?: V2NameHistory[]
}

const defaultNetwork = {
  name: 'Sepolia',
  icon: '/icons/eth.svg',
}

export const AddressHistoryDataTable = ({
  address,
  history,
}: {
  address: Address
  history: AddressHistoryData
}) => {
  // One group per name, so each name's provenance survives until it is judged
  const groups = useMemo(
    () => groupAddressHistoryByName(history.v1Events, history.v2Events),
    [history.v1Events, history.v2Events],
  )

  // Metadata is fetched for every name, acquired or not: the transaction senders
  // are themselves one of the signals the attribution depends on.
  const allRows = useMemo(() => groups.flatMap((group) => group.rows), [groups])

  const blocksNeedingTimestamps = useMemo(
    () => extractBlocksNeedingTimestamps(allRows),
    [allRows],
  )

  const transactionHashes = useMemo(
    () => extractTransactionHashes(allRows),
    [allRows],
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

  const { acquired, assigned } = useMemo(
    () => partitionAddressHistory(groups, address, sendersData),
    [groups, address, sendersData],
  )

  const acquiredEvents = useMemo(
    () => enrichEventsWithMetadata(acquired, timestampsData, sendersData),
    [acquired, timestampsData, sendersData],
  )

  const assignedEvents = useMemo(
    () => enrichEventsWithMetadata(assigned, timestampsData, sendersData),
    [assigned, timestampsData, sendersData],
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
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'addr', addr: address }}>
        {acquiredEvents.length === 0
          ? 'History'
          : `History (${acquiredEvents.length})`}
      </PageHeading>
      {acquiredEvents.length === 0 ? (
        <NoResultsMessage
          title="No history yet"
          description="This address doesn't have any recorded history. Activity will appear here once transactions are made."
          className="mx-0"
        />
      ) : (
        <EventsDataTable<ENSEvent>
          data={acquiredEvents}
          name="" // Name will be extracted from individual transaction events in the sidebar
          enableSidebar={true}
          enableFilters={true}
          enableSearch={true}
          enableTransactionCount={false}
          defaultNetwork={defaultNetwork}
        />
      )}
      {assignedEvents.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2">
              {`Names assigned to this address (${assignedEvents.length})`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Anyone who owns a name can point a subname at any address without
              that address's involvement, and choose the resolver that writes
              its records. The activity below belongs to names assigned to this
              address by someone else — it is not this address's own history,
              and its contents are not vouched for.
            </p>
          </div>
          <EventsDataTable<ENSEvent>
            data={assignedEvents}
            name=""
            enableSidebar={true}
            enableFilters={false}
            enableSearch={false}
            enableTransactionCount={false}
            defaultNetwork={defaultNetwork}
          />
        </section>
      )}
    </div>
  )
}
