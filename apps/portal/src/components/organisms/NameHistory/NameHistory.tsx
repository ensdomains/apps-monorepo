import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import {
  type GetNameHistoryError,
  getNameHistoryQueryOptions,
} from '@/features/profile/hooks/useNameHistory'
import {
  groupEventsByTransactionId,
  type SubgraphEvent,
} from '@/utils/history/groupEventsByTransactionId'

type Category = 'domain' | 'registration' | 'resolver'

interface NameHistoryProps {
  name: string
  category?: Category
}

const categoryToEventType = (c: Category): `${Category}Events` => {
  return `${c}Events`
}

const NameHistoryTable = ({
  name,
  data: history,
  category,
}: {
  name: string
  data: SubgraphEvent[]
  category: Category
}) => {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
  })

  if (error) return <div>Error loading timestamps: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  const data = groupEventsByTransactionId(
    history.map((item) => ({
      ...item,
      timestamp: timestamps?.get(BigInt(item.blockNumber)),
    })),
    category,
  )

  return (
    <EventsDataTable
      enableFilters={false}
      enableSearch={false}
      enableTransactionCount={false}
      enableSidebar={false}
      data={data}
      name={name}
    />
  )
}

export const NameHistory = ({
  name,
  category = 'resolver',
}: NameHistoryProps) => {
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

  if (!data) return <div>No results.</div>

  return (
    <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
      <div>
        <h2 className="text-[26px] font-medium">History</h2>
      </div>
      <NameHistoryTable {...{ name, data, category }} />
    </div>
  )
}
