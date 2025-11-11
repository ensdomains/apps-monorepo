import { flexRender, type Table as TableData } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EventsTableRow } from './EventsTableRow'
import type { BaseEvent, EventsTableData } from './types'

export const EventsTable = <TEvent extends BaseEvent = BaseEvent>({
  table,
}: {
  table: TableData<EventsTableData<TEvent>>
}) => {
  return (
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
  )
}
