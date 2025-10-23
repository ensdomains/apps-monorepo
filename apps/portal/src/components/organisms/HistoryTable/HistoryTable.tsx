import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type HistoryTransaction } from './columns'
import { HistorySidebar } from './HistorySidebar'
import { HistoryTableRow } from './HistoryTableRow'

export const HistoryTable = ({
  name,
  table,
  sidebarOpen,
  setSidebarOpen,
  clickedRow,
}: {
  name: string
  table: TableData<HistoryTransaction>
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  clickedRow: Row<HistoryTransaction> | null
}) => {
  return (
    <HistorySidebar
      row={clickedRow}
      name={name}
      open={sidebarOpen}
      setOpen={setSidebarOpen}
    >
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
              .rows.map((row) => <HistoryTableRow key={row.id} row={row} />)
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No history found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </HistorySidebar>
  )
}
