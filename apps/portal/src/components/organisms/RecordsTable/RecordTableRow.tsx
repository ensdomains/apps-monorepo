import type { Row } from '@tanstack/react-table'
import { PanelRightOpenIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { TableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import { ClickableCell } from './ClickableCell'
import type { NameRecord } from './columns'

export const RecordTableRow = ({
  row,
  tableView,
  setOpen,
  setClickedRow,
  open,
}: {
  row: Row<NameRecord>
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<NameRecord> | null>>
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
        <ClickableCell {...{ cell, setClickedRow, tableView }} key={cell.id} />
      ))}
      <TableCell>
        <Button
          onClick={() => {
            setOpen(!open)
          }}
          variant="secondary"
        >
          More <PanelRightOpenIcon height={12} width={12} />
        </Button>
      </TableCell>
    </TableRow>
  )
}
