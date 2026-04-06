import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  ClockIcon,
  CopyIcon,
  CopySlashIcon,
  GripHorizontal,
  IdCardLanyard,
  SettingsIcon,
  WalletIcon,
} from 'lucide-react'
import { useState } from 'react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { LogoWithTextSVG } from '@/assets/logo'
import { SoonBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { createDefineLinkItem } from '@/utils/tsr'
import { HelpMenu } from './HelpMenu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from './ui/sidebar'
import { WalletMenu } from './WalletMenu'

type SidebarItemData = {
  title: string
  icon: LucideIcon
  disabled?: boolean
  upcoming?: boolean
}

const defineAddrSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItems = (addr: string) => [
  defineAddrSidebarItem({
    title: 'Overview',
    icon: IdCardLanyard,
    link: {
      to: '/addr/$addr',
      params: { addr },
      activeOptions: { exact: true },
    },
  }),
  defineAddrSidebarItem({
    title: 'Names',
    icon: GripHorizontal,
    link: {
      to: '/addr/$addr/names',
      params: { addr },
      activeOptions: { exact: true },
    },
  }),
  defineAddrSidebarItem({
    title: 'Address Resolution',
    icon: CopyIcon,
    upcoming: true,
    link: {
      to: '/addr/$addr/resolution',
      params: { addr },
      activeOptions: { exact: true },
    },
  }),
  defineAddrSidebarItem({
    title: 'Reverse Resolution',
    icon: CopySlashIcon,
    upcoming: true,
    link: {
      to: '/addr/$addr/reverse-resolution',
      params: { addr },
      activeOptions: { exact: true },
    },
  }),
  defineAddrSidebarItem({
    title: 'History',
    icon: ClockIcon,
    link: {
      to: '/addr/$addr/history',
      params: { addr },
    },
  }),
]

interface AddrSidebarProps {
  addr: Address
}

export const AddrSidebar = ({ addr }: AddrSidebarProps) => {
  const items = getItems(addr)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 gap-3">
        <div className="flex items-center justify-between min-h-8">
          <Link
            to="/"
            className="flex items-center group-data-[collapsible=icon]:hidden"
          >
            <LogoWithTextSVG width={72} height="auto" />
          </Link>
          <SidebarTrigger className="shrink-0" />
        </div>

        <div className="group-data-[collapsible=icon]:hidden">
          <HomeSearchInput />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

      <SidebarContent>
        <div className="group-data-[collapsible=icon]:hidden px-3 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-1 w-fit bg-peridot-100 dark:bg-peridot-900/30 rounded px-1.5 py-0.5">
            <span className="text-xs text-peridot-500 font-medium">
              Address
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-9 shrink-0 rounded bg-muted flex items-center justify-center">
              <WalletIcon className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-mono font-medium text-foreground break-all leading-tight">
              {truncateAddress(addr, 6, 4, '...')}
            </span>
          </div>
        </div>

        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-3.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.disabled || item.upcoming ? (
                    <SidebarMenuButton
                      disabled
                      className="opacity-50 cursor-not-allowed"
                      tooltip={item.title}
                    >
                      <item.icon className="size-4" />
                      <span className="text-sm">{item.title}</span>
                      {item.upcoming && <SoonBadge />}
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <Link
                        {...item.link}
                        activeProps={{
                          'data-active': 'true',
                        }}
                      >
                        <item.icon className="size-4" />
                        <span className="text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-3 gap-2">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Help"
              >
                <CircleQuestionMarkIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end">
              <HelpMenu />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Settings"
              >
                <SettingsIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end">
              <TableViewSwitch />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Documentation"
            asChild
          >
            <ExternalLink href="https://docs.ens.domains">
              <BookIcon className="size-4" />
            </ExternalLink>
          </Button>
        </div>

        <WalletMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
