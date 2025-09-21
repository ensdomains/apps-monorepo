import { PopoverTrigger } from '@radix-ui/react-popover'
import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type TableViewSettings,
  useTableViewSettings,
} from '@/features/profile/hooks/useTableViewSettings'
import { columns, type NameRecord } from './columns'
import { RecordSidebar } from './RecordSidebar'
import { RecordTableRow } from './RecordTableRow'
import { TableViewSwitch } from './TableViewSwitch'

export const RecordsTable = ({
  defaultTableSettings,
  name,
  table,
}: {
  name: string
  defaultTableSettings?: TableViewSettings
  table: TableData<NameRecord>
}) => {
  const [clickedRow, setClickedRow] = useState<Row<NameRecord> | null>(null)

  const [open, setOpen] = useState(false)

  const [tableView] = useTableViewSettings(defaultTableSettings)

  return (
    <RecordSidebar row={clickedRow} {...{ name, open, setOpen }}>
      <Table className="relative">
        <Popover>
          <PopoverTrigger className="hidden sm:block absolute right-8 top-4 cursor-pointer">
            <SettingsIcon />
          </PopoverTrigger>
          <PopoverContent align="end">
            <TableViewSwitch />
          </PopoverContent>
        </Popover>
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
                <RecordTableRow
                  key={row.id}
                  {...{ row, tableView, setOpen, setClickedRow, open }}
                />
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
    </RecordSidebar>
  )
}
