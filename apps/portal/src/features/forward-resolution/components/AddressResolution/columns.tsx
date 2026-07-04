import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { SortButton } from '@/components/table/SortButton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DEFAULT_COIN_TYPE, MAINNET_COIN_TYPE } from './networks'
import type { AddressResolutionRow } from './types'

// Default first, Mainnet second, L2s after (then alphabetical).
const sortRank = (coinType: number) => {
  if (coinType === DEFAULT_COIN_TYPE) return 0
  if (coinType === MAINNET_COIN_TYPE) return 1
  return 2
}

export const columns: ColumnDef<AddressResolutionRow>[] = [
  {
    accessorKey: 'label',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Network
      </SortButton>
    ),
    cell: ({ row }) => {
      const { icon, label, coinType } = row.original
      const isDefault = coinType === DEFAULT_COIN_TYPE
      return (
        <div className="flex items-center gap-3">
          {icon ? (
            <img src={icon} alt={label} className="h-5 w-5 shrink-0" />
          ) : (
            <div className="h-5 w-5 shrink-0 rounded-full bg-muted" />
          )}
          <span className={cn('text-foreground', isDefault && 'font-medium')}>
            {label}
          </span>
        </div>
      )
    },
    sortingFn: (a, b) => {
      const rankDiff =
        sortRank(a.original.coinType) - sortRank(b.original.coinType)
      if (rankDiff !== 0) return rankDiff
      return a.original.label.localeCompare(b.original.label)
    },
  },
  {
    accessorKey: 'address',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Record
      </SortButton>
    ),
    cell: ({ row }) => {
      const address = row.original.address
      if (!address)
        return (
          <span className="font-mono text-sm text-muted-foreground/50">
            null
          </span>
        )
      return (
        <span className="font-mono text-sm max-w-[400px] block truncate">
          {address}
        </span>
      )
    },
  },
  {
    accessorKey: 'reverseMatch',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Reverse match
      </SortButton>
    ),
    cell: ({ row }) => {
      const { address, reverseMatch } = row.original

      // No address to reverse-check.
      if (!address || reverseMatch === null)
        return <span className="text-muted-foreground/50">—</span>

      // Reverse lookup still in flight.
      if (reverseMatch === undefined)
        return <Loader2 className="size-4 animate-spin text-muted-foreground" />

      return reverseMatch ? (
        <Badge variant="outline" className="text-xs">
          <CheckCircle2 className="size-4" />
          <span>True</span>
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          <XCircle className="size-4" />
          <span>False</span>
        </Badge>
      )
    },
  },
]
