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
import { SoonBadge } from '@/components/ui/badge'
import { createDefineLinkItem } from '@/utils/tsr'
import { SidebarBrandHeader } from './SidebarBrandHeader'
import { SidebarEntityTab } from './SidebarEntityTab'
import { SidebarUserFooter } from './SidebarUserFooter'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from './ui/sidebar'

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
    link: {
      to: '/addr/$addr/resolution',
      params: { addr },
      activeOptions: { exact: true },
    },
  }),
  defineAddrSidebarItem({
    title: 'Reverse Resolution',
    icon: CopySlashIcon,
    link: {
      to: '/addr/$addr/reverse-resolution',
      params: { addr },
      activeOptions: { exact: true },
    },
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

  return (
    <Sidebar collapsible="icon">
      <SidebarRail />
      <SidebarBrandHeader />

      <SidebarSeparator className="my-6 self-center data-[orientation=horizontal]:w-[calc(100%-3rem)] group-data-[collapsible=icon]:data-[orientation=horizontal]:w-8" />

      <SidebarContent className="gap-3">
        <SidebarEntityTab
          kind="address"
          address={addr}
          icon={WalletIcon}
          link={{ to: '/addr/$addr', params: { addr } }}
        />

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
                      <span>{item.title}</span>
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
                        <span>{item.title}</span>
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

      <SidebarUserFooter />
    </Sidebar>
  )
}
