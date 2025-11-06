import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import { useMemo } from 'react'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
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
  const { data, isLoading, error } = useBlockTimestamps({
    blocks: eventsData.map((tx) => BigInt(tx.blockNumber)),
  })

  // Add timestamps to the events data
  const eventsDataWithTimestamps = useMemo(() => {
    if (!data) return []
    return eventsData.map((tx) => ({
      ...tx,
      timestamp: data.get(BigInt(tx.blockNumber)),
    }))
  }, [eventsData, data])

  if (isLoading) return <div>Loading timestamps...</div>
  if (error) return <div>Error loading timestamps: {error.cause?.message}</div>

  return (
    <EventsDataTable<ENSEvent>
      data={eventsDataWithTimestamps}
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
