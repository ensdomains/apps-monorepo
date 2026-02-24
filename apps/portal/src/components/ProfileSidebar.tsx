import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ClockIcon,
  CoinsIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  ListTreeIcon,
  Network,
  PersonStandingIcon,
  UserLockIcon,
  UserRoundCog,
} from 'lucide-react'
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
      url: '/$name',
      icon: PersonStandingIcon,
    },
  ],
  [
    {
      title: 'Records',
      url: '/$name/records',
      icon: FileSpreadsheetIcon,
    },
    {
      title: 'Resolver',
      url: '/$name/resolver',
      icon: FileCodeIcon,
    },
  ],
  [
    {
      title: 'Ownership',
      url: '/$name/ownership',
      icon: UserLockIcon,
    },
    {
      title: 'Roles',
      url: '/$name/roles',
      icon: UserRoundCog,
    },
  ],
  [
    {
      title: 'Subnames',
      url: '/$name/subnames',
      icon: ListTreeIcon,
    },
    {
      title: 'Registry',
      url: '/$name/registry',
      icon: Network,
    },
  ],
  [
    {
      title: 'Token info',
      url: '/$name/token',
      icon: CoinsIcon,
    },
  ],
  [
    {
      title: 'History',
      url: '/$name/history',
      icon: ClockIcon,
    },
  ],
]

interface ProfileSidebarProps {
  name: string
}

export const ProfileSidebar = ({ name }: ProfileSidebarProps) => {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <span className="ml-3 text-lg font-bold wrap-break-word">{name}</span>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {itemGroups.map((items, i) => {
          const groupKey = items.join(',') + i.toString()
          return (
            <div key={groupKey}>
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
                              <Badge className="ml-auto text-xs px-1.5 py-0 bg-peridot-100 text-peridot-500 hover:bg-peridot-100">
                                Soon
                              </Badge>
                            )}
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton asChild>
                            <Link
                              params={{ name }}
                              to={item.url}
                              activeProps={{
                                'data-active': 'true',
                                className: '!bg-lapis-100 !text-lapis-500',
                              }}
                              activeOptions={{
                                exact: item.url === '/$name',
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
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
