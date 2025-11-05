import { Link } from '@tanstack/react-router'
import {
  ClockIcon,
  CoinsIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  PersonStandingIcon,
  UserLockIcon,
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
} from '../ui/sidebar'

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

export const ProfileSidebar = ({ name }: { name: string }) => {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <span className="text-lg font-bold break-words">{name}</span>
      </SidebarHeader>
      <SidebarContent>
        {itemGroups.map((items, i) => (
          <SidebarGroup key={items.join(',') + i.toString()}>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link params={{ name }} to={item.url}>
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
