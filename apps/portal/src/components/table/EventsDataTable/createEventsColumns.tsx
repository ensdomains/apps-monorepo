import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  PanelRightOpen,
} from 'lucide-react'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { AddressDisplay } from '@/components/organisms/HistoryTable/AddressDisplay'
import { Button } from '@/components/ui/button'
import type { BaseEvent, EventsTableData } from './types'

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

type ColumnConfig = {
  enableSidebar?: boolean
  defaultNetworkName?: string
  defaultNetworkIcon?: string
}

export const createEventsColumns = <TEvent extends BaseEvent = BaseEvent>({
  enableSidebar = true,
  defaultNetworkName = 'Sepolia',
  defaultNetworkIcon = '/icons/eth.svg',
}: ColumnConfig = {}): ColumnDef<EventsTableData<TEvent>>[] => {
  const baseColumns: ColumnDef<EventsTableData<TEvent>>[] = [
    {
      id: 'expander',
      header: () => <div className="pl-4 pr-2" />,
      cell: ({ row }) => {
        const eventCount = row.original.events.length
        return (
          <div className="pl-4 pr-2 flex flex-row items-center gap-1">
            {eventCount > 0 && (
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
            )}
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
        const formatted = new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .format(date)
          .replace(/-/g, '/')
        return <div>{formatted}</div>
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
        const shortTxId = `${txId.slice(0, 6)}…${txId.slice(-4)}`
        return (
          <CopyableRecord
            value={txId}
            displayValue={<span className="font-mono">{shortTxId}</span>}
            className="text-sm underline decoration-dashed underline-offset-4"
          />
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
      accessorKey: 'network',
      header: ({ column }) => (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Network
        </SortButton>
      ),
      cell: ({ row }) => {
        const network = row.original.network
        const networkName = network?.name || defaultNetworkName
        const networkIcon = network?.icon || defaultNetworkIcon

        return (
          <div className="flex flex-row items-center gap-2">
            <img src={networkIcon} alt={networkName} className="w-4 h-4" />
            <span>{networkName}</span>
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        const nameA = rowA.original.network?.name || defaultNetworkName
        const nameB = rowB.original.network?.name || defaultNetworkName
        return nameA.localeCompare(nameB)
      },
    },
  ]

  if (enableSidebar) {
    baseColumns.push({
      id: 'more',
      header: () => null,
      cell: ({ row, table }) => {
        return (
          <div className="flex justify-end pr-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                const meta = table.options.meta as {
                  onMoreClick?: (r: typeof row) => void
                }
                meta?.onMoreClick?.(row)
              }}
            >
              <PanelRightOpen className="h-4 w-4" />
              <span className="text-sm font-medium">More</span>
            </Button>
          </div>
        )
      },
    })
  }

  return baseColumns
}
