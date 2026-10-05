import type { ColumnDef } from '@tanstack/react-table'
import { SortButton } from '@/components/table/SortButton'
import { cn } from '@/lib/utils'
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
        sortDirection={column.getIsSorted()}
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
          sortDirection={column.getIsSorted()}
        >
          Networks
        </SortButton>
      )
    },
    cell: ({ column, row }) => (
      <div className={cn(`w-max flex flex-row items-center gap-2`, 'truncate')}>
        {row.getValue<string[]>(column.id).map((coinType) => (
          <CoinTypeLabel coinType={coinType} key={coinType} />
        ))}
      </div>
    ),
  },
]
