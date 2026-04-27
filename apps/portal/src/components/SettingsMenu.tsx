import { useId } from 'react'
import { ProfileSettingsIcon, TableSettingsIcon } from '@/assets/icons'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Label } from './ui/label'
import { Switch } from './ui/switch'

const TableSettingsSubmenu = () => {
  const [tableView, setTableView] = useTableViewSettings()
  const compactId = useId()
  const strippedRowsId = useId()
  const wrapTextId = useId()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <TableSettingsIcon className="size-4" />
        Table settings
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-48">
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="justify-between"
        >
          <Label htmlFor={compactId} className="cursor-pointer font-normal">
            Compact rows
          </Label>
          <Switch
            id={compactId}
            checked={tableView.compact}
            onCheckedChange={() =>
              setTableView({ ...tableView, compact: !tableView.compact })
            }
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="justify-between"
        >
          <Label
            htmlFor={strippedRowsId}
            className="cursor-pointer font-normal"
          >
            Striped rows
          </Label>
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
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="justify-between"
        >
          <Label htmlFor={wrapTextId} className="cursor-pointer font-normal">
            Wrap text
          </Label>
          <Switch
            id={wrapTextId}
            checked={tableView.wrapText}
            onCheckedChange={() =>
              setTableView({ ...tableView, wrapText: !tableView.wrapText })
            }
          />
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export const SettingsMenu = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
        >
          <ProfileSettingsIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-52">
        <ThemeToggle />
        <TableSettingsSubmenu />
        {/* <DropdownMenuItem asChild>
          <ExternalLink href="https://sepolia.etherscan.io">
            <ChipLinkIcon className="size-3" />
            Sepolia explorer
          </ExternalLink>
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
