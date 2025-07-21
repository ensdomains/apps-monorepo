import { Link } from '@tanstack/react-router'
import { FileSpreadsheetIcon, PersonStandingIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
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
      title: 'Records',
      url: '/$name/records',
      icon: FileSpreadsheetIcon,
    },
  ],
] as const

export const ProfileSidebar = ({ name }: { name: string }) => {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <span className="text-lg font-bold">{name}</span>
      </SidebarHeader>
      <SidebarContent>
        {itemGroups.map((items) => (
          <SidebarGroup key={items.join(',')}>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link params={{ name }} to={item.url}>
                        <item.icon height={24} width={24} />
                        <span className="text-sm font-medium">{item.title}</span>
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
