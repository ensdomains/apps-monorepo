import { useId } from 'react'
import { ExternalLink } from 'react-external-link'
import {
  ChipLinkIcon,
  LanguageIcon,
  ProfileSettingsIcon,
  TableSettingsIcon,
  VisibilityOffIcon,
} from '@/assets/icons'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { useDoNotTrack } from '@/hooks/useDoNotTrack'
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
  const [doNotTrack, setDoNotTrack] = useDoNotTrack()
  const doNotTrackId = useId()

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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <LanguageIcon className="size-4" />
            Language
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem className="bg-accent">English</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <TableSettingsSubmenu />
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="justify-between"
        >
          <Label
            htmlFor={doNotTrackId}
            className="flex items-center gap-2 cursor-pointer font-normal text-foreground"
          >
            <VisibilityOffIcon className="size-4" />
            Do not track
          </Label>
          <Switch
            id={doNotTrackId}
            checked={doNotTrack}
            onCheckedChange={setDoNotTrack}
          />
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ExternalLink href="https://sepolia.etherscan.io">
            <ChipLinkIcon className="size-3" />
            Sepolia explorer
          </ExternalLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
