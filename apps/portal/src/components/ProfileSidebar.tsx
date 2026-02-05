import { Link } from '@tanstack/react-router'
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

const itemGroups = [
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
] as const

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
                        <SidebarMenuButton asChild>
                          <Link params={{ name }} to={item.url}>
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
              {i < itemGroups.length - 1 && <SidebarSeparator />}
            </div>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
