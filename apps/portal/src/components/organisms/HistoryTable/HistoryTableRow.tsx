import { flexRender, type Row } from '@tanstack/react-table'
import { TableCell, TableRow } from '@/components/ui/table'
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
          {row.original.events.map((event) => (
            <TableRow
              key={event.id}
              className="bg-gray-50 hover:bg-gray-100 border-l-4 border-l-blue-200"
            >
              <TableCell />
              <TableCell colSpan={4} className="pl-12">
                <div className="flex flex-row items-center gap-3">
                  <span className="font-medium">{event.type}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 capitalize">
                    {event.category}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  )
}

