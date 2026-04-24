import { Link } from '@tanstack/react-router'
import { IdCardIcon } from 'lucide-react'
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
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { createDefineLinkItem } from '@/utils/tsr'
import { SettingsMenu } from './SettingsMenu'
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
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
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
  const { state, isMobile } = useSidebar()
  const isIconMode = state === 'collapsed' && !isMobile

  return (
    <Sidebar collapsible="icon">
      <SidebarRail />
      <SidebarTrigger className="hidden group-data-[collapsible=icon]:flex absolute right-0 translate-x-full top-6 z-50 bg-background border border-border rounded-r-md shadow-sm" />
      <SidebarHeader className="p-0 gap-0">
        {isIconMode ? (
          <div className="flex flex-col items-center gap-4 pt-6 px-2">
            <Link
              to="/"
              className="flex items-center min-h-8"
              aria-label="ENS Home"
            >
              <LogoSVG height={30} className="text-foreground" />
            </Link>
            <HomeSearchInput iconOnly />
          </div>
        ) : (
          <div className="px-6 pt-6 flex flex-col gap-6">
            <div className="flex items-center min-h-8">
              <Link to="/" className="flex items-center">
                <LogoWithTextSVG
                  width={97}
                  height={30}
                  className="text-foreground"
                />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <HomeSearchInput />
              </div>
              <SidebarTrigger className="shrink-0" />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarSeparator className="my-6 self-center data-[orientation=horizontal]:w-[calc(100%-3rem)] group-data-[collapsible=icon]:data-[orientation=horizontal]:w-8" />

      <SidebarContent className="gap-3">
        {/* TLD name section */}
        <div className="px-6 flex flex-col gap-2 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
          <div className="group-data-[collapsible=icon]:hidden flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="flex items-center justify-center bg-lapis-100 dark:bg-lapis-900/30 rounded-xs size-4 shrink-0">
                <IdCardIcon className="size-2.5 text-lapis-500" />
              </div>
              <span className="text-xs text-lapis-500 font-medium">TLD</span>
            </div>
            <CopyButton value={tld} />
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

        <SidebarGroup className="px-6 py-0 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-3">
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

      <SidebarSeparator className="my-6 self-center data-[orientation=horizontal]:w-[calc(100%-3rem)]" />

      <SidebarFooter className="px-6 pb-6 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-4 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-3.5">
          <div className="flex-1 group-data-[collapsible=icon]:flex-none">
            <WalletMenu />
          </div>
          <SettingsMenu />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
