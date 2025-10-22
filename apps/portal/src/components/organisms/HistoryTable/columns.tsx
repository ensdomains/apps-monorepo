import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowLeftFromLine,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  CopyIcon,
} from 'lucide-react'
import type { Address } from 'viem'
import { Button } from '@/components/ui/button'
import { AddressDisplay } from './AddressDisplay'

export type HistoryTransaction = {
  transactionID: string
  blockNumber: number
  timestamp?: bigint
  from: Address | null
  events: Array<{
    id: string
    type: string
    category: 'domain' | 'registration' | 'resolver'
    details: unknown
  }>
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

export const columns: ColumnDef<HistoryTransaction>[] = [
  {
    id: 'expander',
    header: () => null,
    cell: ({ row }) => {
      const eventCount = row.original.events.length
      return (
        <div className="pl-4 pr-2 flex flex-row items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label={
              row.getIsExpanded() ? 'Collapse events' : 'Expand events'
            }
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
          >
            {row.getIsExpanded() ? <ChevronUp /> : <ChevronDown />}
            <span className="text-sm font-medium">{eventCount}</span>
          </Button>
        </div>
      )
    },
  },
  {
    accessorKey: 'timestamp',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Date
      </SortButton>
    ),
    cell: ({ row }) => {
      const timestamp = row.original.timestamp
      if (!timestamp) return <div>-</div>

      const date = new Date(Number(timestamp) * 1000)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')

      return <div>{`${year}/${month}/${day}`}</div>
    },
  },
  {
    accessorKey: 'transactionID',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Transaction
      </SortButton>
    ),
    cell: ({ row }) => {
      const txId = row.original.transactionID
      return (
        <div className="flex flex-row items-center gap-2">
          <span className="font-mono text-sm underline decoration-dashed underline-offset-4">
            {txId.slice(0, 6)}…{txId.slice(-4)}
          </span>
          <button
            type="button"
            className="cursor-pointer hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard.writeText(txId)
            }}
          >
            <CopyIcon className="h-3 w-3" />
          </button>
        </div>
      )
    },
  },
  {
    accessorKey: 'from',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        From
      </SortButton>
    ),
    cell: ({ row }) => {
      const from = row.original.from
      if (!from) return <span className="text-gray-400">-</span>

      return <AddressDisplay address={from} />
    },
  },
  {
    id: 'network',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Network
      </SortButton>
    ),
    cell: () => {
      return (
        <div className="flex flex-row items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <span>Sepolia</span>
        </div>
      )
    },
  },
  {
    id: 'more',
    header: () => null,
    cell: ({ row }) => {
      return (
        <div className="flex justify-end pr-4">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              console.log(
                'More clicked for transaction:',
                row.original.transactionID,
              )
            }}
          >
            <ArrowLeftFromLine className="h-4 w-4" />
            <span className="text-sm font-medium">More</span>
          </Button>
        </div>
      )
    },
  },
]
