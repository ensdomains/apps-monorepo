import { type Cell, flexRender, type Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import type { TableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import type { NameRecord } from './columns'

export const ClickableCell = ({
  cell,
  setClickedRow,
  tableView,
}: {
  cell: Cell<NameRecord, unknown>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<NameRecord> | null>>
  tableView: TableViewSettings
}) => {
  if (cell.column.id === 'select') {
    return (
      <TableCell key={cell.id} className={tableView.compact ? 'py-2' : 'py-4'}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  } else {
    return (
      <TableCell
        key={cell.id}
        className={tableView.compact ? 'py-2' : 'py-4'}
        onClick={() => {
          setClickedRow(cell.row)
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  }
}
