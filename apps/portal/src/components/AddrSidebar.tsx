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
import { Badge } from '@/components/ui/badge'
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

type SidebarItem = {
  title: string
  url: string
  icon: LucideIcon
  disabled?: boolean
  upcoming?: boolean
}

const itemGroups: SidebarItem[][] = [
  [
    {
      title: 'Overview',
      url: '/addr/$addr',
      icon: IdCardLanyard,
    },
    {
      title: 'Names',
      url: '/addr/$addr/names',
      icon: GripHorizontal,
    },
  ],
  [
    {
      title: 'Address Resolution',
      url: '/addr/$addr/resolution',
      icon: CopyIcon,
      upcoming: true,
    },
    {
      title: 'Reverse Resolution',
      url: '/addr/$addr/reverse-resolution',
      icon: CopySlashIcon,
      upcoming: true,
    },
  ],
  [
    {
      title: 'History',
      url: '/addr/$addr/history',
      icon: ClockIcon,
    },
  ],
]

interface AddrSidebarProps {
  addr: Address
}

export const AddrSidebar = ({ addr }: AddrSidebarProps) => {
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
          <div key={items[0].url}>
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
                          {item.upcoming && (
                            <Badge className="ml-auto text-[10px] px-1.5 py-0 bg-peridot-100 text-peridot-500 hover:bg-peridot-100">
                              Soon
                            </Badge>
                          )}
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton asChild>
                          <Link
                            params={{ addr }}
                            to={item.url}
                            activeProps={{
                              'data-active': 'true',
                              className: '!bg-lapis-100 !text-lapis-500',
                            }}
                            activeOptions={{
                              exact: item.url === '/addr/$addr',
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
