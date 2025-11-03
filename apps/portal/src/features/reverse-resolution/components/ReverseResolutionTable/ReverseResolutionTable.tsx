import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { useState } from 'react'
import { SidebarTriggerRow } from '@/components/molecules/SidebarTriggerRow'
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
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'
import { columns } from './columns'
import { ReverseResolutionSidebar } from './ReverseResolutionSidebar'

export const ReverseResolutionTable = ({
  defaultTableSettings,
  table,
}: {
  defaultTableSettings?: TableViewSettings
  table: TableData<ReverseResolutionResult>
}) => {
  const [clickedRow, setClickedRow] =
    useState<Row<ReverseResolutionResult> | null>(null)

  const [open, setOpen] = useState(false)

  const [tableView] = useTableViewSettings(defaultTableSettings)

  return (
    <ReverseResolutionSidebar row={clickedRow} {...{ open, setOpen }}>
      <Table className="relative">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead className="px-6 py-2" key={header.id}>
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
                <SidebarTriggerRow
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
    </ReverseResolutionSidebar>
  )
}
