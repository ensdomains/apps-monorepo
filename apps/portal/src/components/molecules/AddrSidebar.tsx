import { Link } from '@tanstack/react-router'
import {
  CopyIcon,
  CopySlashIcon,
  IdCardLanyard,
  WalletIcon,
} from 'lucide-react'
import type { Address } from 'viem'
import { LogoWithTextSVG } from '@/assets/logo'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar'

const itemGroups = [
  [
    {
      title: 'Overview',
      url: '/addr/$addr',
      icon: IdCardLanyard,
    },
  ],
  [
    {
      title: 'Address Resolution',
      url: '/addr/$addr/resolution',
      icon: CopyIcon,
    },
    {
      title: 'Reverse Resolution',
      url: '/addr/$addr/reverse-resolution',
      icon: CopySlashIcon,
    },
  ],
] as const

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
          <LogoWithTextSVG width={72} />
          <span className="font-bold">Explorer</span>
        </Link>
        <div className="flex flex-row gap-2 items-start">
          <WalletIcon />
          <span className="text-lg font-mono font-medium w-full max-w-md overflow-hidden break-words">
            {addr}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {itemGroups.map((items) => (
          <SidebarGroup className="p-6" key={items.join(',')}>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link params={{ addr }} to={item.url}>
                        <item.icon className="size-6" />
                        <span className="text-sm font-medium">
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
