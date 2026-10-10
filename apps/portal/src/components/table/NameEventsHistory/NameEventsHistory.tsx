import { useQuery } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import {
  type GetNameHistoryParameters,
  getNameHistoryQueryOptions,
  NAME_HISTORY_PAGE_SIZE,
} from '@/features/profile/hooks/useNameHistory'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import {
  groupEventsByTransactionId,
  type HistoryTableEvent,
} from '@/utils/history/groupEventsByTransactionId'
import { historyEventsToTableEvents } from '@/utils/history/historyEventsToTableEvents'

type Category = 'domain' | 'registration' | 'resolver'

interface NameEventsHistoryProps {
  name: string
  category?: Category
  /**
   * Optional pre-fetched events. When provided, the name's history is not read.
   */
  v2Events?: HistoryTableEvent[]
  enableHeader?: boolean
}

/**
 * The old ENSv1 subgraph's event categories as bigname history filters: the
 * name's own surface, its registration lifecycle, or its resolver activity.
 */
const CATEGORY_FILTERS: Record<
  Category,
  Pick<GetNameHistoryParameters, 'scope' | 'type'>
> = {
  domain: { scope: 'name' },
  registration: { scope: 'registration' },
  resolver: { type: ['record', 'resolver'] },
}

const NameEventsHistoryTable = ({
  name,
  data: history,
  category,
}: {
  name: string
  data: HistoryTableEvent[]
  category: Category
}) => {
  // bigname dates every row, so each transaction carries its own timestamp.
  const groupedData = groupEventsByTransactionId(history, category)

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
    return <div>No sender data available</div>
  }

  return (
    <EventsDataTable
      enableFilters={false}
      enableSearch={false}
      enableTransactionCount={false}
      enableSidebar={false}
      enableNetwork={false}
      data={groupedData.map((tx) => ({
        ...tx,
        from: sendersData.get(tx.transactionID as Hash) || tx.from,
      }))}
      name={name}
    />
  )
}

export const NameEventsHistory = ({
  name,
  category = 'resolver',
  v2Events,
  enableHeader = true,
}: NameEventsHistoryProps) => {
  const hasEvents = !!v2Events

  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    ...getNameHistoryQueryOptions({
      name,
      ...CATEGORY_FILTERS[category],
      page_size: NAME_HISTORY_PAGE_SIZE,
    }),
    enabled: !hasEvents,
  })

  if (!hasEvents && isLoading) return <LoadingSpinner title="Loading..." />
  if (!hasEvents && error) return <div>Error: {extractErrorMessage(error)}</div>

  const data =
    v2Events ?? (history ? historyEventsToTableEvents(history) : undefined)

  if (!data || data.length === 0)
    return (
      <div className="flex flex-col gap-4 w-full">
        {enableHeader && <HistorySectionHeader />}
        <NoResultsMessage
          title="No recent activity"
          description="Events will appear here as they happen."
          className="mx-0 my-0"
        />
      </div>
    )

  return (
    <div className="flex flex-col gap-4 w-full">
      {enableHeader && <HistorySectionHeader />}
      <NameEventsHistoryTable {...{ name, data, category }} />
    </div>
  )
}
