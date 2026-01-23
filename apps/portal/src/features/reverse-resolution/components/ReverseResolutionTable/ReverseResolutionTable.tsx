import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { SidebarTriggerRow } from '@/components/SidebarTriggerRow'
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
  address,
}: {
  defaultTableSettings?: TableViewSettings
  table: TableData<ReverseResolutionResult>
  address: Address
}) => {
  const [clickedRow, setClickedRow] =
    useState<Row<ReverseResolutionResult> | null>(null)

  const [open, setOpen] = useState(false)

  const [tableView] = useTableViewSettings(defaultTableSettings)

  const { address: account } = useConnection()

  // Only show "More" button if the displayed address matches the connected account
  const canModify = account?.toLowerCase() === address.toLowerCase()

  return (
    <ReverseResolutionSidebar
      row={clickedRow}
      address={address}
      {...{ open, setOpen }}
    >
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
              {canModify && (
                <TableHead className="px-6 py-2">Actions</TableHead>
              )}
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
                  showMoreButton={canModify}
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
