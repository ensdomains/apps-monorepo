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

const defineProfileSidebarItem = createDefineLinkItem<SidebarItemData>()

const getItemGroups = (name: string) => [
  [
    defineProfileSidebarItem({
      title: 'Overview',
      icon: PersonStandingIcon,
      link: {
        to: '/$name',
        params: { name },
        activeOptions: { exact: true },
      },
    }),
  ],
  [
    defineProfileSidebarItem({
      title: 'Records',
      icon: FileSpreadsheetIcon,
      link: {
        to: '/$name/records',
        params: { name },
      },
    }),
    defineProfileSidebarItem({
      title: 'Resolver',
      icon: FileCodeIcon,
      link: {
        to: '/$name/resolver',
        params: { name },
      },
    }),
  ],
  [
    defineProfileSidebarItem({
      title: 'Ownership',
      icon: UserLockIcon,
      link: {
        to: '/$name/ownership',
        params: { name },
      },
    }),
    defineProfileSidebarItem({
      title: 'Roles',
      icon: UserRoundCog,
      link: {
        to: '/$name/roles',
        params: { name },
      },
    }),
  ],
  [
    defineProfileSidebarItem({
      title: 'Subnames',
      icon: ListTreeIcon,
      link: {
        to: '/$name/subnames',
        params: { name },
      },
    }),
    defineProfileSidebarItem({
      title: 'Registry',
      icon: Network,
      link: {
        to: '/$name/registry',
        params: { name },
      },
    }),
  ],
  [
    defineProfileSidebarItem({
      title: 'Token info',
      icon: CoinsIcon,
      link: {
        to: '/$name/token',
        params: { name },
      },
    }),
  ],
  [
    defineProfileSidebarItem({
      title: 'History',
      icon: ClockIcon,
      link: {
        to: '/$name/history',
        params: { name },
      },
    }),
  ],
]

interface ProfileSidebarProps {
  name: string
}

export const ProfileSidebar = ({ name }: ProfileSidebarProps) => {
  const itemGroups = getItemGroups(name)

  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <span className="ml-3 text-lg font-bold wrap-break-word">{name}</span>
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
