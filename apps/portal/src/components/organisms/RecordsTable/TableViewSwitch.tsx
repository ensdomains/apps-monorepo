import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'

export const TableViewSwitch = () => {
  const [tableView, setTableView] = useTableViewSettings()
  const tableViewId = useId()
  const strippedRowsId = useId()
  const wrapTextId = useId()

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-row gap-2">
        <Switch
          id={tableViewId}
          checked={tableView.compact}
          onCheckedChange={() =>
            setTableView({ ...tableView, compact: !tableView.compact })
          }
        />
        <Label htmlFor={tableViewId}>Compact View</Label>
      </span>
      <span className="flex flex-row gap-2">
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
        <Label htmlFor={strippedRowsId}>Striped Rows</Label>
      </span>
      <span className="flex flex-row gap-2">
        <Switch
          id={wrapTextId}
          checked={tableView.wrapText}
          onCheckedChange={() =>
            setTableView({ ...tableView, wrapText: !tableView.wrapText })
          }
        />
        <Label htmlFor={wrapTextId}>Wrap Text</Label>
      </span>
    </div>
  )
}
