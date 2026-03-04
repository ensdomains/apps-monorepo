import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'

export const TableViewSwitch = () => {
  const [tableView, setTableView] = useTableViewSettings()
  const compactId = useId()
  const strippedRowsId = useId()
  const wrapTextId = useId()

  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-row items-center justify-between gap-4">
        <Label htmlFor={compactId}>Compact rows</Label>
        <Switch
          id={compactId}
          checked={tableView.compact}
          onCheckedChange={() =>
            setTableView({ ...tableView, compact: !tableView.compact })
          }
        />
      </span>
      <span className="flex flex-row items-center justify-between gap-4">
        <Label htmlFor={strippedRowsId}>Striped rows</Label>
        <Switch
          id={strippedRowsId}
          checked={tableView.strippedRows}
          onCheckedChange={() =>
            setTableView({
              ...tableView,
              strippedRows: !tableView.strippedRows,
            })
          }
        />
      </span>
      <span className="flex flex-row items-center justify-between gap-4">
        <Label htmlFor={wrapTextId}>Wrap text</Label>
        <Switch
          id={wrapTextId}
          checked={tableView.wrapText}
          onCheckedChange={() =>
            setTableView({ ...tableView, wrapText: !tableView.wrapText })
          }
        />
      </span>
    </div>
  )
}
