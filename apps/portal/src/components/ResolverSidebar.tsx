import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ClockIcon,
  IdCardLanyard,
  RefreshCwIcon,
  SplitIcon,
  UserRoundCog,
} from 'lucide-react'
import type { Address } from 'viem'
import { LogoWithTextSVG } from '@/assets/logo'
import { Badge } from '@/components/ui/badge'
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

const defineResolverSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItemGroups = (address: string) => [
  [
    defineResolverSidebarItem({
      title: 'Overview',
      icon: IdCardLanyard,
      link: {
        to: '/resolver/$address',
        params: { address },
        activeOptions: { exact: true },
      },
    }),
  ],
  [
    defineResolverSidebarItem({
      title: 'Roles',
      icon: UserRoundCog,
      upcoming: true,
      link: {
        to: '/resolver/$address',
        params: { address },
      },
    }),
    defineResolverSidebarItem({
      title: 'Aliases',
      icon: SplitIcon,
      upcoming: true,
      link: {
        to: '/resolver/$address',
        params: { address },
      },
    }),
  ],
  [
    defineResolverSidebarItem({
      title: 'History',
      icon: ClockIcon,
      upcoming: true,
      link: {
        to: '/resolver/$address',
        params: { address },
      },
    }),
  ],
]

interface ResolverSidebarProps {
  address: Address
}

export const ResolverSidebar = ({ address }: ResolverSidebarProps) => {
  const itemGroups = getItemGroups(address)

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
          <RefreshCwIcon className="size-6 shrink-0 mt-1" />
          <span className="text-lg font-mono font-medium w-full max-w-md overflow-hidden wrap-break-word">
            {address}
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
                          {item.upcoming && (
                            <Badge
                              variant="success"
                              className="ml-auto text-[10px] px-1.5 py-0"
                            >
                              Soon
                            </Badge>
                          )}
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
