import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useTableViewSettings } from "@/features/profile/hooks/useTableViewSettings"



export const TableViewSwitch = () => {

  const [tableView, setTableView] = useTableViewSettings()

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-row gap-2">
        <Switch id="compact-view" checked={tableView.compact} onCheckedChange={() => setTableView({ ...tableView, compact: !tableView.compact })} />
        <Label htmlFor="compact-view">Compact View</Label>
      </span>
      <span className="flex flex-row gap-2">
        <Switch id="stripped-rows" checked={tableView.strippedRows} onCheckedChange={() => setTableView({ ...tableView, strippedRows: !tableView.strippedRows })} />
        <Label htmlFor="stripped-rows">Striped Rows</Label>
      </span>
      <span className="flex flex-row gap-2">
        <Switch id="wrap-text" checked={tableView.wrapText} onCheckedChange={() => setTableView({ ...tableView, wrapText: !tableView.wrapText })} />
        <Label htmlFor="wrap-text">Wrap Text</Label>
      </span>
    </div>
  )
}