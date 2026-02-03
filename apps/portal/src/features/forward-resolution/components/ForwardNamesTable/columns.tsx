import type { ColumnDef } from '@tanstack/react-table'
import { SortButton } from '@/components/table/SortButton'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn, fromCoinType } from '@/lib/utils'
import { CoinTypeLabel } from '../CoinTypeLabel'

export type ForwardName = {
  name: string
  coinTypes: string[]
}

export const columns: ColumnDef<ForwardName>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
      </SortButton>
    ),
  },
  {
    accessorKey: 'coinTypes',
    header: ({ column }) => {
      return (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Networks
        </SortButton>
      )
    },
    cell: ({ column, row }) => {
      const coins = row
        .getValue<string[]>(column.id)
        .map((coin) => fromCoinType(BigInt(Number.parseInt(coin, 10))))

      const [settings] = useTableViewSettings()

      return (
        <div
          className={cn(
            `w-max flex flex-row gap-2`,
            settings.wrapText ? 'break-all whitespace-normal' : 'truncate',
          )}
        >
          {coins.map((coin) => (
            <CoinTypeLabel coin={coin} key={coin} />
          ))}
        </div>
      )
    },
  },
]
