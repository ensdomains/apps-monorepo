import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { GridIcon, SplitIcon } from 'lucide-react'
import type { Address } from 'viem'
import { HistoryIcon, ResolverIcon, ShieldIcon } from '@/assets/icons'
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
}

const defineResolverSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItems = (address: Address) => [
  defineResolverSidebarItem({
    title: 'Nodes',
    icon: GridIcon,
    link: { to: '/resolver/$address/nodes', params: { address } },
  }),
  defineResolverSidebarItem({
    title: 'Links',
    icon: SplitIcon,
    link: { to: '/resolver/$address/links', params: { address } },
  }),
  defineResolverSidebarItem({
    title: 'Roles',
    icon: ShieldIcon,
    link: { to: '/resolver/$address/roles', params: { address } },
  }),
  defineResolverSidebarItem({
    title: 'History',
    icon: HistoryIcon,
    link: { to: '/resolver/$address/history', params: { address } },
  }),
]

interface ResolverSidebarProps {
  address: Address
}

export const ResolverSidebar = ({ address }: ResolverSidebarProps) => {
  const items = getItems(address)

  return (
    <Sidebar collapsible="icon">
      <SidebarRail />
      <SidebarBrandHeader />

      <SidebarSeparator className="my-6 self-center data-[orientation=horizontal]:w-[calc(100%-3rem)] group-data-[collapsible=icon]:data-[orientation=horizontal]:w-8" />

      <SidebarContent className="gap-3">
        <SidebarEntityTab
          kind="contract"
          address={address}
          icon={ResolverIcon}
          link={{ to: '/resolver/$address', params: { address } }}
        />

        <SidebarGroup className="px-6 py-0 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-3">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <Link
                      {...item.link}
                      activeProps={{ 'data-active': 'true' }}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
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
