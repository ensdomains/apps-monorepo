import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { fromCoinType } from '@/lib/utils'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

const AddressHistory = ({
  history,
  name,
}: {
  history: ReturnResolverEvent[]
  name: string
}) => {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
  })

  if (error) return <div>Error loading timestamps: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  const data = groupEventsByTransactionId(
    history.map((item) => ({
      ...item,
      timestamp: timestamps?.get(BigInt(item.blockNumber)),
    })),
    'resolver',
  )

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg overflow-y-scroll">
      <h3 className="text-2xl font-medium">History</h3>
      <EventsDataTable name={name} data={data} />
    </div>
  )
}

const HistoryView = ({ name }: { name: string }) => {
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

  if (isLoading) return <div>Loading...</div>

  if (!history) return <div>No history</div>

  return <AddressHistory history={history} name={name} />
}

export const ForwardNameDetails = ({ name, coinTypes }: ForwardName) => {
  const coins = coinTypes.map((coin) =>
    fromCoinType(BigInt(Number.parseInt(coin, 10))),
  )

  return (
    <div className="flex flex-col p-4 sm:p-8 gap-4 sm:gap-6">
      <h2 className="text-3xl font-medium">{name}</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row">
          <div className="w-full max-w-40">Name</div>
          <div className="flex flex-row gap-1">
            <NameAvatar height="20px" width="20px" name={name} />
            <CopyableRecord href={`/${name}`} value={name} />
          </div>
        </div>
        <div className="flex flex-row">
          <div className="w-full max-w-40">Records</div>
          <div className="flex flex-row gap-1">
            {coins.map((coin) => (
              <CoinTypeLabel coin={coin} key={coin} />
            ))}
          </div>
        </div>
        <HistoryView name={name} />
      </div>
    </div>
  )
}
