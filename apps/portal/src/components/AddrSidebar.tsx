import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  CopyIcon,
  CopySlashIcon,
  GripHorizontal,
  WalletIcon,
} from 'lucide-react'
import type { Address } from 'viem'
import { HistoryIcon } from '@/assets/icons'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { SoonBadge } from '@/components/ui/badge'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
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
  icon: LucideIcon | React.ComponentType<{ className?: string }>
  disabled?: boolean
  upcoming?: boolean
}

const defineAddrSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItems = (addr: string) => [
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
    disabled: true,
  }),
  defineAddrSidebarItem({
    title: 'Reverse Resolution',
    icon: CopySlashIcon,
    link: {
      to: '/addr/$addr/reverse-resolution',
      params: { addr },
      activeOptions: { exact: true },
    },
    disabled: true,
  }),
  defineAddrSidebarItem({
    title: 'History',
    icon: HistoryIcon,
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
  const { state, isMobile } = useSidebar()
  const isIconMode = state === 'collapsed' && !isMobile

  return (
    <Sidebar collapsible="icon">
      <SidebarRail />
      <SidebarTrigger className="hidden group-data-[collapsible=icon]:flex absolute right-0 translate-x-full top-6 z-50 bg-secondary hover:bg-quartz-100 border border-border rounded-r-md shadow-sm" />
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
        <div className="px-6 flex flex-col gap-2 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
          <Link
            to="/addr/$addr"
            params={{ addr }}
            activeProps={{ 'data-active': 'true' }}
            activeOptions={{ exact: true }}
            className="group/title flex w-full items-center gap-2 rounded-md px-2 py-2 outline-hidden ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 data-[active=true]:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-1"
          >
            <div className="size-6 shrink-0 rounded bg-neutral-2 group-data-[active=true]/title:bg-neutral-3 flex items-center justify-center">
              <WalletIcon className="size-3.5 text-neutral-6" />
            </div>
            <span className="group-data-[collapsible=icon]:hidden text-sm font-mono font-medium text-foreground break-all leading-tight">
              {truncateAddress(addr, 6, 4, '...')}
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
