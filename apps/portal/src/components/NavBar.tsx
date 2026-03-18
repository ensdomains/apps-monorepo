import { useHotkey } from '@tanstack/react-hotkeys'
import { Link, useMatches, useRouterState } from '@tanstack/react-router'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  Menu,
  SettingsIcon,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
import { HelpMenu } from './HelpMenu'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { WalletMenu } from './WalletMenu'

// Lazy load SidebarTrigger to prevent hook errors in production when sidebar isn't available
const SidebarTrigger = lazy(() =>
  import('./ui/sidebar').then((mod) => ({ default: mod.SidebarTrigger })),
)

export const NavBar = () => {
  const { location } = useRouterState()
  const matches = useMatches()
  const [helpOpen, setHelpOpen] = useState(false)

  useHotkey('Shift+/', () => setHelpOpen((prev) => !prev))

  // Show sidebar when any match in the route chain has hideSidebar !== true (default)
  const hasSidebar = matches.some((match) => !match.staticData?.hideSidebar)

  return (
    <nav className="sticky top-0 left-0 flex flex-row gap-2 p-4 bg-background text-foreground w-full justify-between border-b border-b-border h-(--header-height) z-50">
      <div className="flex flex-row gap-2 items-center w-auto md:w-full">
        {hasSidebar && (
          <Suspense fallback={null}>
            <SidebarTrigger className="md:hidden" />
          </Suspense>
        )}
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
              className="absolute -top-3 -right-34 text-xs z-10"
            >
              Alpha
            </Badge>
          </div>
          <span className="font-bold text-2xl hidden md:inline text-primary">
            Explorer
          </span>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <div className="flex flex-row items-center gap-2">
                  <CircleQuestionMarkIcon className="size-4" />
                  Help
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <div className="p-2">
                  <HelpMenu />
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Help menu"
              >
                <CircleQuestionMarkIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <HelpMenu />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Settings"
              >
                <SettingsIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <TableViewSwitch />
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Documentation"
            asChild
          >
            <ExternalLink href="https://docs.ens.domains">
              <BookIcon className="size-4" />
            </ExternalLink>
          </Button>
        </div>

        <WalletMenu />
      </div>
    </nav>
  )
}
