import { flexRender, type Table as TableData } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { stripedRowClassName } from '@/components/table/stripedRowClassName'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import { NameMobileCard } from '../NameMobileCard'
import { columns, type NameRow } from './columns'

interface NamesTableProps {
  table: TableData<NameRow>
}

export const NamesTable = ({ table }: NamesTableProps) => {
  const [tableView] = useTableViewSettings()
  const rows = table.getRowModel().rows

  return (
    <>
      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {rows.length > 0 ? (
          rows.map((row) => (
            <NameMobileCard
              key={row.id}
              name={row.original.name}
              expiryDate={row.original.expiryDate}
              roleBitmap={row.original.roleBitmap}
              v1Roles={row.original.v1Roles}
              protocolVersion={row.original.protocolVersion}
              isSelected={row.getIsSelected()}
              onSelectChange={(selected) => row.toggleSelected(selected)}
            />
          ))
        ) : (
          <div className="px-6 py-8 text-center text-muted-foreground">
            No results.
          </div>
        )}
      </div>

      {/* Desktop view - Table layout */}
      <Table className="relative hidden md:table">
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
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={stripedRowClassName(tableView.strippedRows)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={cn('px-6', tableView.compact ? 'py-2' : 'py-4')}
                    key={cell.id}
                  >
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
    </>
  )
}
