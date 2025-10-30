import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { fromCoinType } from '@/lib/utils'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

const columns: ColumnDef<ReturnResolverEvent>[] = [
  {
    accessorKey: 'transactionID',
    header: 'Transaction',
  },
  {
    accessorKey: 'type',
    header: 'Type',
  },
]

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

  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg overflow-y-scroll">
      <h3 className="text-2xl font-medium">History</h3>
      <DataTable data={history || []} columns={columns} />
    </div>
  )
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
