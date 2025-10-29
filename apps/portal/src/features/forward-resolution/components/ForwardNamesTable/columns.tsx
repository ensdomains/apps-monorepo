import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, LinkIcon } from 'lucide-react'
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

type CoinType = 1 | 10 | 42161 | 8453 | 59144 | 534352

const icons = {
  1: '/icons/eth.svg',
  10: '/icons/op.svg',
  42161: '/icons/arb.svg',
  8453: '/icons/base.svg',
  59144: '/icons/linea.svg',
  534352: '/icons/scroll.svg',
} as const satisfies Record<CoinType, string>

const names = {
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  8453: 'Base',
  59144: 'Linea',
  534352: 'Scroll',
} as const satisfies Record<CoinType, string>

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
          {coins.map((coin) =>
            coin in icons && coin in names ? (
              <span
                className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl"
                key={coin}
              >
                <img
                  key={coin}
                  height={24}
                  width={24}
                  alt={coin.toString()}
                  src={icons[coin as CoinType]}
                />{' '}
                {names[coin as CoinType]}
              </span>
            ) : coin === 0 ? (
              <span
                className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl items-center"
                key={coin}
              >
                <LinkIcon height={16} width={16} />
                <span>Default</span>
              </span>
            ) : (
              <span key={coin}>{coin}</span>
            ),
          )}
        </div>
      )
    },
  },
]
