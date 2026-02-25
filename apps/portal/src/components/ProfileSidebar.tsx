import { type ActiveLinkOptions, Link } from '@tanstack/react-router'
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

type SidebarItem = {
  title: string
  // Using ActiveLinkOptions like this is actually quite heavy for the compiler to type check since it has to check for all possible combinations of the options when spread into the Link component. See more here https://tanstack.com/router/latest/docs/guide/type-safety#avoid-internal-types-without-narrowing
  // The issue is that the alternatives instead make us do `as const satisfies ActiveLinkOptions` which while it does work and makes it faster for the compiler, properties like disabled and upcoming which are currently not used disappear from the result type and cause issues elsewhere.
  // I built an alternative to this in the utils/tsr.ts file that allows for partial const type checking of the link options while keeping the other properties as the original type. An example can be seen further down in this file.
  link: ActiveLinkOptions
  icon: LucideIcon
  disabled?: boolean
  upcoming?: boolean
}

const getItemGroups = (name: string): SidebarItem[][] => [
  [
    {
      title: 'Overview',
      link: {
        to: '/$name',
        params: {
          name,
        },
        activeOptions: {
          exact: true,
        },
      },
      icon: PersonStandingIcon,
    },
  ],
  [
    {
      title: 'Records',
      link: {
        to: '/$name/records',
        params: {
          name,
        },
      },
      icon: FileSpreadsheetIcon,
    },
    {
      title: 'Resolver',
      link: {
        to: '/$name/resolver',
        params: {
          name,
        },
      },
      icon: FileCodeIcon,
    },
  ],
  [
    {
      title: 'Ownership',
      link: {
        to: '/$name/ownership',
        params: {
          name,
        },
      },
      icon: UserLockIcon,
    },
    {
      title: 'Roles',
      link: {
        to: '/$name/roles',
        params: {
          name,
        },
      },
      icon: UserRoundCog,
    },
  ],
  [
    {
      title: 'Subnames',
      link: {
        to: '/$name/subnames',
        params: {
          name,
        },
      },
      icon: ListTreeIcon,
    },
    {
      title: 'Registry',
      link: {
        to: '/$name/registry',
        params: {
          name,
        },
      },
      icon: Network,
    },
  ],
  [
    {
      title: 'Token info',
      link: {
        to: '/$name/token',
        params: {
          name,
        },
      },
      icon: CoinsIcon,
    },
  ],
  [
    {
      title: 'History',
      link: {
        to: '/$name/history',
        params: {
          name,
        },
      },
      icon: ClockIcon,
    },
  ],
]

const defineItem = createDefineLinkItem<SidebarItem>()

// This should in theory be faster for the compiler to type check since it doesn't have to check for all possible combinations of the routes when spread into the Link component.
const getItemGroupsOptimized = (name: string) => [
  [
    defineItem({
      title: 'Overview',
      link: {
        to: '/$name',
        params: {
          name,
        },
        activeOptions: {
          exact: true,
        },
      },
      icon: PersonStandingIcon,
    }),
  ],
  [
    defineItem({
      title: 'Records',
      link: {
        to: '/$name/records',
        params: {
          name,
        },
      },
      icon: FileSpreadsheetIcon,
    }),
    defineItem({
      title: 'Resolver',
      link: {
        to: '/$name/resolver',
        params: {
          name,
        },
      },
      icon: FileCodeIcon,
    }),
  ],
  [
    defineItem({
      title: 'Ownership',
      link: {
        to: '/$name/ownership',
        params: {
          name,
        },
      },
      icon: UserLockIcon,
    }),
    defineItem({
      title: 'Roles',
      link: {
        to: '/$name/roles',
        params: {
          name,
        },
      },
      icon: UserRoundCog,
    }),
  ],
  [
    defineItem({
      title: 'Subnames',
      link: {
        to: '/$name/subnames',
        params: {
          name,
        },
      },
      icon: ListTreeIcon,
    }),
    defineItem({
      title: 'Registry',
      link: {
        to: '/$name/registry',
        params: {
          name,
        },
      },
      icon: Network,
    }),
  ],
  [
    defineItem({
      title: 'Token info',
      link: {
        to: '/$name/token',
        params: {
          name,
        },
      },
      icon: CoinsIcon,
    }),
  ],
  [
    defineItem({
      title: 'History',
      link: {
        to: '/$name/history',
        params: {
          name,
        },
      },
      icon: ClockIcon,
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
                            {item.icon && <item.icon className="size-6" />}
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
                                ...item.link.activeProps,
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
