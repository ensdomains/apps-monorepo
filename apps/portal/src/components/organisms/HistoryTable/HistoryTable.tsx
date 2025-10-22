import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type HistoryTransaction } from './columns'
import { HistoryTableRow } from './HistoryTableRow'

export const HistoryTable = ({
  table,
}: {
  name: string
  table: TableData<HistoryTransaction>
}) => {
  const [, setClickedRow] = useState<Row<HistoryTransaction> | null>(null)
  const [open, setOpen] = useState(false)

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
              <HistoryTableRow
                key={row.id}
                {...{ row, setOpen, setClickedRow, open }}
              />
            ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              No history found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

