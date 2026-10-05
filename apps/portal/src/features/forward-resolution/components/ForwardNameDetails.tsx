import { useQuery } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { InfoRow } from '@/components/InfoCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import {
  getRecordHistoryQueryOptions,
  type RecordHistoryEvent,
} from '@/features/records/hooks/useRecordHistory'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

interface AddressHistoryProps {
  history: RecordHistoryEvent[]
  name: string
}

const AddressHistory = ({ history, name }: AddressHistoryProps) => {
  // bigname dates every row, so the grouped transactions carry their timestamp.
  const groupedData = groupEventsByTransactionId(history, 'resolver')

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction senders..." />
  }

  if (sendersError) {
    return (
      <div>
        Error loading transaction senders: {sendersError.cause?.message}
      </div>
    )
  }

  if (!sendersData) {
    return <div>No data available</div>
  }

  const dataWithTimestampsAndSenders = groupedData.map((tx) => ({
    ...tx,
    from: sendersData.get(tx.transactionID as Hash) || tx.from,
  }))

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <HistorySectionHeader />
      <EventsDataTable
        enableTransactionCount={false}
        enableFilters={false}
        enableSearch={false}
        name={name}
        data={dataWithTimestampsAndSenders}
      />
    </div>
  )
}

interface HistoryViewProps {
  name: string
}

const HistoryView = ({ name }: HistoryViewProps) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery(
    getRecordHistoryQueryOptions({
      name,
      key: 'coins',
    }),
  )

  if (error) {
    return <div>History Error: {error.cause?.message || error.message}</div>
  }

  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!history) return <div>No history</div>

  return <AddressHistory history={history} name={name} />
}

export const ForwardNameDetails = ({ name, coinTypes }: ForwardName) => {
  return (
    <div className="flex flex-col p-6 gap-6 [&_[data-slot=info-row]]:px-0">
      <h2 className="font-sans text-h2">{name}</h2>
      <div className="flex flex-col">
        <InfoRow label="Name">
          <EntityBadge variant="name" name={name} showAvatar>
            {name}
          </EntityBadge>
        </InfoRow>
        <InfoRow label="Records">
          <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
            {coinTypes.map((coinType) => (
              <CoinTypeLabel coinType={coinType} key={coinType} />
            ))}
          </div>
        </InfoRow>
      </div>
      <HistoryView name={name} />
    </div>
  )
}
