import { Link } from '@tanstack/react-router'
import { PersonStandingIcon } from 'lucide-react'
import type { Address } from 'viem'
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
      icon: PersonStandingIcon,
    },
  ],
] as const

export const AddrSidebar = ({ addr }: { addr: Address }) => {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <span className="text-lg font-mono font-medium w-full max-w-md overflow-hidden break-words">
          {addr}
        </span>
      </SidebarHeader>
      <SidebarContent>
        {itemGroups.map((items) => (
          <SidebarGroup key={items.join(',')}>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link params={{ addr }} to={item.url}>
                        <item.icon height={24} width={24} />
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
