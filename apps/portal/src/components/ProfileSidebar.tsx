import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  BookIcon,
  CircleQuestionMarkIcon,
  ClockIcon,
  CoinsIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FlameIcon,
  ListTreeIcon,
  Network,
  PersonStandingIcon,
  SettingsIcon,
  UserLockIcon,
  UserRoundCog,
} from 'lucide-react'
import { useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { LogoWithTextSVG } from '@/assets/logo'
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
  icon: LucideIcon
  disabled?: boolean
  upcoming?: boolean
}

const defineProfileSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItems = (name: string) => [
  defineProfileSidebarItem({
    title: 'Overview',
    icon: PersonStandingIcon,
    link: {
      to: '/$name',
      params: { name },
      activeOptions: { exact: true },
    },
  }),
  defineProfileSidebarItem({
    title: 'Records',
    icon: FileSpreadsheetIcon,
    link: {
      to: '/$name/records',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Resolver',
    icon: FileCodeIcon,
    link: {
      to: '/$name/resolver',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Ownership',
    icon: UserLockIcon,
    link: {
      to: '/$name/ownership',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Roles',
    icon: UserRoundCog,
    link: {
      to: '/$name/roles',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Fuses',
    icon: FlameIcon,
    link: {
      to: '/$name/fuses',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Subnames',
    icon: ListTreeIcon,
    link: {
      to: '/$name/subnames',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Registry',
    icon: Network,
    link: {
      to: '/$name/registry',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'Token info',
    icon: CoinsIcon,
    link: {
      to: '/$name/token',
      params: { name },
    },
  }),
  defineProfileSidebarItem({
    title: 'History',
    icon: ClockIcon,
    link: {
      to: '/$name/history',
      params: { name },
    },
  }),
]

interface ProfileSidebarProps {
  name: string
}

export const ProfileSidebar = ({ name }: ProfileSidebarProps) => {
  const items = getItems(name)
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
            <LogoWithTextSVG width={72} height="auto" />
          </Link>
          <SidebarTrigger className="shrink-0" />
        </div>

        {/* Search — hidden when collapsed */}
        <div className="group-data-[collapsible=icon]:hidden">
          <HomeSearchInput />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

      <SidebarContent>
        {/* Name section — hidden when collapsed */}
        <div className="group-data-[collapsible=icon]:hidden px-3 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-1 w-fit bg-lapis-100 dark:bg-lapis-900/30 rounded px-1.5 py-0.5">
            <span className="text-xs text-lapis-500 font-medium">Name</span>
          </div>
          <div className="flex items-center gap-2">
            <NameAvatar
              name={name}
              height="36px"
              width="36px"
              rounded="rounded"
            />
            <span className="text-base font-medium text-foreground break-all leading-tight">
              {name}
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
        {/* Help / Settings / Docs row */}
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
