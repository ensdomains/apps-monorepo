import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  Menu,
  SettingsIcon,
} from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { HomeSearchInput } from '@/components/homepage'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { SidebarTrigger } from '../ui/sidebar'

export const NavBar = () => {
  const { location } = useRouterState()
  // Only show sidebar trigger on routes that have a sidebar (/$name or /addr/$addr)
  const hasSidebar =
    location.pathname !== '/' &&
    (location.pathname.match(/^\/[^/]+(\/|$)/) ||
      location.pathname.startsWith('/addr/'))

  return (
    <nav className="sticky top-0 left-0 flex flex-row gap-2 p-4 bg-background text-foreground w-full justify-between border-b border-b-gray-300 h-(--header-height) z-50">
      <div className="flex flex-row gap-2 items-center w-auto md:w-full">
        {hasSidebar && <SidebarTrigger className="md:hidden" />}
        <Link to="/" className="flex flex-row gap-2 items-center relative">
          {/* Small logo for mobile */}
          <div className="relative md:hidden">
            <LogoSVG width={25} height={28} />
            <Badge
              variant="secondary"
              className="absolute -top-3 -right-10 text-xs z-10"
            >
              Alpha
            </Badge>
          </div>
          {/* Full logo with text for desktop */}
          <div className="relative hidden md:flex">
            <LogoWithTextSVG width={72} height="auto" />
            <Badge
              variant="secondary"
              className="absolute -top-3 -right-25 text-xs z-10"
            >
              Alpha
            </Badge>
          </div>
          <span className="font-bold hidden md:inline">Explorer</span>
        </Link>
      </div>
      {location.pathname !== '/' && (
        <div className="flex flex-row gap-2 w-full">
          <HomeSearchInput />
        </div>
      )}
      <div className="flex gap-2 flex-row justify-end items-center md:w-full">
        {/* Mobile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-7 md:hidden">
              <Menu className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="." className="flex flex-row items-center gap-2">
                <CircleQuestionMarkIcon className="size-4" />
                Help
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <div className="flex flex-row items-center gap-2">
                  <SettingsIcon className="size-4" />
                  Settings
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <div className="p-2">
                  <TableViewSwitch />
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <ExternalLink
                href="https://docs.ens.domains"
                className="flex flex-row items-center gap-2"
              >
                <BookIcon className="size-4" />
                Documentation
              </ExternalLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Desktop icons */}
        <div className="hidden md:flex gap-2 flex-row items-center">
          <Link className="flex flex-row items-center gap-1" to=".">
            <CircleQuestionMarkIcon className="size-4" />
          </Link>

          <Popover>
            <PopoverTrigger className="cursor-pointer">
              <SettingsIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end">
              <TableViewSwitch />
            </PopoverContent>
          </Popover>
          <ExternalLink
            className="flex flex-row items-center gap-1"
            href="https://docs.ens.domains"
          >
            <BookIcon className="size-4" />
          </ExternalLink>
        </div>

        <ConnectButton showBalance={false} accountStatus="avatar" />
      </div>
    </nav>
  )
}
