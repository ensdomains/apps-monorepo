import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type Record } from './columns'

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T][]

const recordsToTableData = (records: GetRecordsReturnType) => {
  const data: Record[] = []

  for (const [key, value] of Object.entries(
    records,
  ) as Entries<GetRecordsReturnType>) {
    if (key === 'contentHash' && value) {
      data.push({
        type: key,
        value: `${value.protocolType}://${value.decoded}`,
      })
    }
    if (key === 'texts') {
      for (const { key, value: text } of Object.values(value)) {
        data.push({ key, value: text, type: 'text' })
      }
    }
    if (key === 'coins') {
      for (const { name, value: addr, id } of Object.values(value)) {
        data.push({ key: name, value: addr, type: 'coin', id })
      }
    }
  }

  return data
}

export const RecordsTable = ({
  records,
  rowSelection,
  setRowSelection,
}: {
  records: GetRecordsReturnType
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
}) => {
  const tableData = useMemo(() => recordsToTableData(records), [records])

  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  return (
    <Table>
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
          table.getRowModel().rows.map((row, _i) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
