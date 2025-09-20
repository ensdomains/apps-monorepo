import { type Cell, flexRender, type Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import type { TableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import type { Record } from './columns'

export const ClickableCell = ({
  cell,
  toggleSidebar,
  setClickedRow,
  tableView,
}: {
  cell: Cell<Record, unknown>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<Record> | null>>
  toggleSidebar: () => void
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
          toggleSidebar()
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  }
}
