import { flexRender, type Row } from '@tanstack/react-table'
import type { Address } from 'viem'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { TableCell, TableRow } from '@/components/ui/table'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import type { BaseEvent, EventsTableData } from './types'

export const EventsTableRow = <TEvent extends BaseEvent = BaseEvent>({
  row,
}: {
  row: Row<EventsTableData<TEvent>>
}) => {
  const [tableView] = useTableViewSettings()

  return (
    <>
      <TableRow
        className={cn(
          'hover:bg-gray-200',
          tableView.strippedRows && 'even:bg-gray-100',
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            className={cn('px-6', tableView.compact ? 'py-2' : 'py-4')}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {row.getIsExpanded() &&
        row.original.events.map((event) => {
          // Extract "from" address from event details
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
            <TableRow key={event.id} className="hover:bg-gray-200">
              <TableCell colSpan={2} />

              {/* Transaction column - show event type */}
              <TableCell>
                <span>{event.type}</span>
              </TableCell>

              <TableCell>
                {fromAddress ? (
                  <AddressDisplay address={fromAddress as Address} />
                ) : (
                  <span>-</span>
                )}
              </TableCell>

              <TableCell colSpan={2} />
            </TableRow>
          )
        })}
    </>
  )
}
