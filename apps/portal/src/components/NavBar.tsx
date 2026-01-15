import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  Menu,
  SettingsIcon,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { ExternalLink } from 'react-external-link'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
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

// Lazy load SidebarTrigger to prevent hook errors in production when sidebar isn't available
const SidebarTrigger = lazy(() =>
  import('./ui/sidebar').then((mod) => ({ default: mod.SidebarTrigger })),
)

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
              <ExternalLink
                className="flex flex-row items-center gap-2"
                href="https://ens.domains/ensv2"
              >
                <CircleQuestionMarkIcon className="size-4" />
                Help
              </ExternalLink>
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
          <ExternalLink
            className="flex flex-row items-center gap-1"
            href="https://ens.domains/ensv2"
          >
            <CircleQuestionMarkIcon className="size-4" />
          </ExternalLink>

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
