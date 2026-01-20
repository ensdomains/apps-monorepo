import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, PanelRightOpen } from 'lucide-react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { EventsTableRow } from './EventsTableRow'
import type { BaseEvent, EventsTableData } from './types'

const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MobileHistoryCard = <TEvent extends BaseEvent = BaseEvent>({
  row,
  table,
}: {
  row: Row<EventsTableData<TEvent>>
  table: TableData<EventsTableData<TEvent>>
}) => {
  const eventCount = row.original.events.length
  const timestamp = row.original.timestamp
  const txId = row.original.transactionID
  const from = row.original.from
  const network = row.original.network

  // Check if sidebar is enabled by looking at columns
  const hasSidebar = table.getAllColumns().some((col) => col.id === 'more')
  const hasNetwork = table.getAllColumns().some((col) => col.id === 'network')

  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-white border-b border-gray-200 last:border-b-0">
      {/* Top row: Expander and More button */}
      <div className="flex justify-between items-start">
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
        {hasSidebar && (
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
        )}
      </div>

      {/* Date */}
      {timestamp && (
        <>
          <div className="text-sm font-medium">Date</div>
          <div className="text-base">
            {formatter
              .format(new Date(Number(timestamp) * 1000))
              .replace(/-/g, '/')}
          </div>
        </>
      )}

      {/* Transaction */}
      <div className="text-sm font-medium">Transaction</div>
      <CopyableRecord
        value={txId}
        displayValue={
          <span className="font-mono">{truncateAddress(txId)}</span>
        }
        className="text-sm underline decoration-dashed underline-offset-4"
        href={`https://sepolia.etherscan.io/tx/${txId}`}
      />

      {/* From */}
      {from && (
        <>
          <div className="text-sm font-medium">From</div>
          <AddressDisplay address={from} />
        </>
      )}

      {/* Network */}
      {hasNetwork && network && (
        <>
          <div className="text-sm font-medium">Network</div>
          <div className="flex flex-row items-center gap-2">
            {network.icon && (
              <img src={network.icon} alt={network.name} className="w-4 h-4" />
            )}
            <span className="text-base">{network.name}</span>
          </div>
        </>
      )}

      {/* Expanded events */}
      {row.getIsExpanded() &&
        row.original.events.map((event) => {
          const eventDetails = event.details as Record<string, unknown>
          let fromAddress: string | null = null

          if (eventDetails.owner && typeof eventDetails.owner === 'string') {
            fromAddress = eventDetails.owner
          } else if (
            eventDetails.registrant &&
            typeof eventDetails.registrant === 'string'
          ) {
            fromAddress = eventDetails.registrant
          } else if (
            eventDetails.newOwner &&
            typeof eventDetails.newOwner === 'string'
          ) {
            fromAddress = eventDetails.newOwner
          }

          return (
            <div
              key={event.id}
              className="pl-4 border-l-2 border-gray-300 flex flex-col gap-2"
            >
              <div className="text-sm font-medium">Event</div>
              <div className="text-base">{event.type}</div>
              {fromAddress && (
                <>
                  <div className="text-sm font-medium">From</div>
                  <AddressDisplay address={fromAddress as Address} />
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}

export const EventsTable = <TEvent extends BaseEvent = BaseEvent>({
  table,
}: {
  table: TableData<EventsTableData<TEvent>>
}) => {
  return (
    <>
      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {table.getRowModel().rows?.length ? (
          table
            .getRowModel()
            .rows.map((row) => (
              <MobileHistoryCard<TEvent> key={row.id} row={row} table={table} />
            ))
        ) : (
          <div className="px-6 py-24 text-center border border-gray-200 rounded-lg">
            No history found.
          </div>
        )}
      </div>

      {/* Desktop view - Table layout */}
      <div className="hidden md:block">
        <Table className="relative">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table
                .getRowModel()
                .rows.map((row) => (
                  <EventsTableRow<TEvent> key={row.id} row={row} />
                ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center"
                >
                  No history found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
