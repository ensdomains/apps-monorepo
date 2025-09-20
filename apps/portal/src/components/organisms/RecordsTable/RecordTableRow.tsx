import type { Row } from '@tanstack/react-table'
import { TableRow } from '@/components/ui/table'
import type { TableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import { ClickableCell } from './ClickableCell'
import type { Record } from './columns'

export const RecordTableRow = ({
  row,
  tableView,
  setOpen,
  setClickedRow,
  open,
}: {
  row: Row<Record>
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<Record> | null>>
  tableView: TableViewSettings
  open: boolean
}) => {
  return (
    <TableRow
      className={cn(
        'hover:bg-gray-200',
        tableView.strippedRows && 'even:bg-gray-100',
      )}
      key={row.id}
      data-state={row.getIsSelected() && 'selected'}
    >
      {row.getVisibleCells().map((cell) => (
        <ClickableCell
          {...{ cell, setClickedRow, tableView }}
          key={cell.id}
          toggleSidebar={() => {
            setOpen(!open)
          }}
        />
      ))}
    </TableRow>
  )
}
