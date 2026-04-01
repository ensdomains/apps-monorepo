import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ClockIcon,
  CopyIcon,
  CopySlashIcon,
  GripHorizontal,
  IdCardLanyard,
  WalletIcon,
} from 'lucide-react'
import type { Address } from 'viem'
import { LogoWithTextSVG } from '@/assets/logo'
import { SoonBadge } from '@/components/ui/badge'
import { createDefineLinkItem } from '@/utils/tsr'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from './ui/sidebar'

type SidebarItemData = {
  title: string
  icon: LucideIcon
  disabled?: boolean
  upcoming?: boolean
}

const defineAddrSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItemGroups = (addr: string) => [
  [
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
  ],
  [
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
  ],
  [
    defineAddrSidebarItem({
      title: 'History',
      icon: ClockIcon,
      link: {
        to: '/addr/$addr/history',
        params: { addr },
      },
    }),
  ],
]

interface AddrSidebarProps {
  addr: Address
}

export const AddrSidebar = ({ addr }: AddrSidebarProps) => {
  const itemGroups = getItemGroups(addr)

  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader className="p-6">
        <Link
          to="/"
          className="flex md:hidden flex-row gap-2 items-center mb-4"
        >
          <LogoWithTextSVG width={72} height="auto" />
          <span className="font-bold">Explorer</span>
        </Link>
        <div className="flex flex-row gap-2 items-start">
          <WalletIcon />
          <span className="text-lg font-mono font-medium w-full max-w-md overflow-hidden wrap-break-word">
            {addr}
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {itemGroups.map((items, i) => (
          <div key={items[0].title}>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      {item.disabled || item.upcoming ? (
                        <SidebarMenuButton
                          disabled
                          className="opacity-50 cursor-not-allowed"
                        >
                          <item.icon className="size-6" />
                          <span className="text-sm font-medium">
                            {item.title}
                          </span>
                          {item.upcoming && <SoonBadge />}
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton asChild>
                          <Link
                            {...item.link}
                            activeProps={{
                              'data-active': 'true',
                            }}
                          >
                            <item.icon className="size-6" />
                            <span className="text-sm font-medium">
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {i < itemGroups.length - 1 && <SidebarSeparator />}
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
