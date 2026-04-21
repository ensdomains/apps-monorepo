import { Link } from '@tanstack/react-router'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  IdCardIcon,
  SettingsIcon,
} from 'lucide-react'
import { useState } from 'react'
import { ExternalLink } from 'react-external-link'
import {
  CardsStackIcon,
  HistoryIcon,
  HubIcon,
  KeyIcon,
  TollIcon,
} from '@/assets/icons'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { CopyButton } from '@/components/CopyButton'
import { SoonBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
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
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  upcoming?: boolean
}

const defineTldSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItems = (tld: string) => [
  defineTldSidebarItem({
    title: 'Records',
    icon: CardsStackIcon,
    disabled: true,
    upcoming: true,
    link: {
      to: '/tld/$tld',
      params: { tld },
    },
  }),
  defineTldSidebarItem({
    title: 'Roles',
    icon: KeyIcon,
    disabled: true,
    upcoming: true,
    link: {
      to: '/tld/$tld',
      params: { tld },
    },
  }),
  defineTldSidebarItem({
    title: 'Registry',
    icon: HubIcon,
    disabled: true,
    upcoming: true,
    link: {
      to: '/tld/$tld',
      params: { tld },
    },
  }),
  defineTldSidebarItem({
    title: 'Token info',
    icon: TollIcon,
    disabled: true,
    upcoming: true,
    link: {
      to: '/tld/$tld',
      params: { tld },
    },
  }),
  defineTldSidebarItem({
    title: 'History',
    icon: HistoryIcon,
    disabled: true,
    upcoming: true,
    link: {
      to: '/tld/$tld',
      params: { tld },
    },
  }),
]

interface TldSidebarProps {
  tld: string
}

export const TldSidebar = ({ tld }: TldSidebarProps) => {
  const items = getItems(tld)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 gap-3">
        {/* Logo row */}
        <div className="flex items-center justify-between min-h-8">
          <Link
            to="/"
            className="flex items-center group-data-[collapsible=icon]:hidden"
          >
            <LogoSVG
              width={35}
              height={40}
              className="sm:hidden text-foreground"
            />
            <LogoWithTextSVG
              width={72}
              height="auto"
              className="hidden sm:block text-foreground"
            />
          </Link>
          <SidebarTrigger className="shrink-0 bg-sidebar-accent hover:bg-sidebar-accent/80" />
        </div>

        {/* Search — hidden when collapsed */}
        <div className="group-data-[collapsible=icon]:hidden">
          <HomeSearchInput />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

      <SidebarContent>
        {/* TLD name section */}
        <div className="px-3 py-3 flex flex-col gap-2 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
          <div className="group-data-[collapsible=icon]:hidden flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="flex items-center justify-center bg-lapis-100 dark:bg-lapis-900/30 rounded-xs size-4 shrink-0">
                <IdCardIcon className="size-2.5 text-lapis-500" />
              </div>
              <span className="text-xs text-lapis-500 font-medium">TLD</span>
            </div>
            <CopyButton
              value={tld}
              className="bg-sidebar-accent hover:bg-sidebar-accent/80"
            />
          </div>
          <Link
            to="/tld/$tld"
            params={{ tld }}
            activeProps={{ 'data-active': 'true' }}
            className="flex items-center gap-2 hover:opacity-80"
          >
            <NameAvatar
              name={tld}
              height="36px"
              width="36px"
              rounded="rounded-xs"
            />
            <span className="group-data-[collapsible=icon]:hidden text-base font-medium text-foreground break-all leading-tight">
              {tld}
            </span>
          </Link>
        </div>

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

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <div className="flex-1 group-data-[collapsible=icon]:flex-none">
            <WalletMenu />
          </div>
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
      </SidebarFooter>
    </Sidebar>
  )
}
