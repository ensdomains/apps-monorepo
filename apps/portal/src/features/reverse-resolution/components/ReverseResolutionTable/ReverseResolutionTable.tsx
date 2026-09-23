import {
  flexRender,
  type Row,
  type Table as TableData,
} from '@tanstack/react-table'
import { useState } from 'react'
import type { Address } from 'viem'
import { SidebarTriggerRow } from '@/components/SidebarTriggerRow'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsConnectedAddress } from '@/hooks/useIsConnectedAddress'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'
import { columns } from './columns'
import { ReverseResolutionSidebar } from './ReverseResolutionSidebar'

export const ReverseResolutionTable = ({
  table,
  address,
}: {
  table: TableData<ReverseResolutionResult>
  address: Address
}) => {
  // Track the selected row by its coin type (stable id) rather than holding a
  // Row object, which would go stale on refetch. See the forward-resolution
  // table for the same pattern.
  const [selectedCoinType, setSelectedCoinType] = useState<number | null>(null)

  const [open, setOpen] = useState(false)

  const clickedRow =
    selectedCoinType != null
      ? (table
          .getRowModel()
          .rows.find((r) => r.original.coinType === selectedCoinType) ?? null)
      : null

  const setClickedRow = (
    value: React.SetStateAction<Row<ReverseResolutionResult> | null>,
  ) => {
    setSelectedCoinType((prev) => {
      const prevRow =
        prev != null
          ? (table
              .getRowModel()
              .rows.find((r) => r.original.coinType === prev) ?? null)
          : null

      const newRow = typeof value === 'function' ? value(prevRow) : value

      return newRow?.original.coinType ?? null
    })
  }

  // Only show the "More" button if the displayed address is the connected
  // account: every write behind it is signer-scoped. The route gates its empty
  // state on the same hook, so a record-less table and its row actions always
  // appear together.
  const canModify = useIsConnectedAddress(address)

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
                  {...{ row, setOpen, setClickedRow, open }}
                />
              ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="px-6 py-24 text-center"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ReverseResolutionSidebar>
  )
}
