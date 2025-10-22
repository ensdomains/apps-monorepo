import { flexRender, type Row } from '@tanstack/react-table'
import type { Address } from 'viem'
import { TableCell, TableRow } from '@/components/ui/table'
import { AddressDisplay } from './AddressDisplay'
import type { HistoryTransaction } from './columns'

export const HistoryTableRow = ({
  row,
  setOpen,
  setClickedRow,
  open,
}: {
  row: Row<HistoryTransaction>
  setOpen: (open: boolean) => void
  setClickedRow: (row: Row<HistoryTransaction> | null) => void
  open: boolean
}) => {
  const handleClick = () => {
    setClickedRow(row)
    setOpen(true)
  }

  return (
    <>
      <TableRow
        onClick={handleClick}
        className="hover:bg-gray-200"
        data-state={open && 'selected'}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="py-4">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {row.getIsExpanded() && (
        <>
          {row.original.events.map((event) => {
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
                {/* Empty expander column */}
                <TableCell className="py-4" />

                {/* Empty date column */}
                <TableCell className="py-4" />

                {/* Transaction column - show event type */}
                <TableCell className="py-4">
                  <span>{event.type}</span>
                </TableCell>

                {/* From column - show address/name */}
                <TableCell className="py-4">
                  {fromAddress ? (
                    <AddressDisplay address={fromAddress as Address} />
                  ) : (
                    <span>-</span>
                  )}
                </TableCell>

                {/* Empty network column */}
                <TableCell className="py-4" />

                {/* Empty more column */}
                <TableCell className="py-4" />
              </TableRow>
            )
          })}
        </>
      )}
    </>
  )
}
