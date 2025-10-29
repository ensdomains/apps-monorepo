import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn, fromCoinType } from '@/lib/utils'

export type ForwardName = {
  name: string
  coinTypes: string[]
}

const SortButton = ({ children, ...props }: React.ComponentProps<'button'>) => {
  return (
    <button
      className="p-0 flex flex-row items-center cursor-pointer"
      type="button"
      {...props}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </button>
  )
}

const icons = {
  1: '/icons/eth.svg',
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
            `font-mono w-full max-w-[30vw] sm:max-w-[670px]`,
            settings.wrapText ? 'break-all whitespace-normal' : 'truncate',
          )}
        >
          {coins.map((coin) =>
            icons[coin] ? (
              <img
                key={coin}
                height={24}
                width={24}
                alt={coin}
                src={icons[coin]}
              />
            ) : (
              coin
            ),
          )}
        </div>
      )
    },
  },
]
