import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import { NotificationItem } from '@/features/notifications/components/notifications/notification-items'
import {
  notificationsInfiniteQuery,
  unreadCountQuery,
} from '@/features/notifications/queries/notifications'
import { tw } from '@/utils/tailwind'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

const FilterBadge = (props: { active: boolean; label: string }) => {
  return (
    <div
      className={tw(
        'cursor-not-allowed rounded-full px-4 py-3 font-normal text-base leading-ens-tight',
        props.active
          ? 'bg-[#232222] text-white'
          : 'bg-ens-white text-[#7D7D7D]',
      )}
    >
      {props.label}
    </div>
  )
}

const UnreadCount = () => {
  const unread = useQuery(unreadCountQuery)

  if (!unread.data) return null

  return (
    <div
      className={tw(
        'rounded-full px-1.5 py-0.5 font-medium text-sm leading-ens-tight',
        unread.data?.unreadCount > 0
          ? 'bg-ens-lapis-dust text-ens-lapis-core'
          : 'bg-ens-white text-[#7D7D7D]',
      )}
    >
      {unread.data?.unreadCount ?? 0}
    </div>
  )
}

const NotificationsList = () => {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(notificationsInfiniteQuery)

  // Flatten all notifications from all pages
  const allNotifications = data ?? []

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center">
        <Loader2Icon className="size-10 animate-spin" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="text-ens-garnet-core text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  if (allNotifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center">
        <MSymbol className="ms-opsz-75 ms-wght-200" symbol="sentiment_calm" />
        <div className="text-[#717182] text-base">You're all caught up!</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {allNotifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
      {hasNextPage && (
        <Button
          className="w-fit"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          variant="outline"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  )
}

function RouteComponent() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-12 rounded-lg border-[#dededf] bg-white px-6 py-8 lg:my-5 lg:border">
      <div className="flex flex-col gap-8">
        <div className="flex justify-between">
          {/* title row */}
          <div className="flex items-center gap-3">
            {/* title */}
            <div className="font-[350] font-serif text-[#232222] text-temp-32px leading-ens-none">
              All Notifications
            </div>
            <UnreadCount />
          </div>
          {/* right slot */}
          <Link
            className="group flex items-center gap-2"
            to="/notifications/settings"
          >
            <MSymbol className="ms-opsz-30 ms-wght-200" symbol="settings" />
            <div className="font-normal text-[#232222] text-base leading-ens-normal group-hover:underline max-sm:hidden">
              Notification Settings
            </div>
          </Link>
        </div>
        <div className="flex justify-between">
          <Field className="w-fit" orientation="horizontal">
            <Switch id="switch-disabled-unchecked" />
            <FieldLabel
              className="font-normal"
              htmlFor="switch-disabled-unchecked"
            >
              Unread only
            </FieldLabel>
          </Field>

          {/* right slot */}
          <button
            className="font-normal text-base text-ens-lapis-core leading-ens-normal hover:underline"
            type="button"
          >
            Mark all as read
          </button>
        </div>
        <InputGroup className="h-10 border-0 bg-[#FCFBFB]">
          <InputGroupInput placeholder="Search notifications" />
          <InputGroupAddon>
            <MSymbol className="ms-opsz-24 ms-wght-200" symbol="search" />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex gap-3">
          <FilterBadge active={true} label="All" />
          <FilterBadge active={false} label="Expiry" />
          <FilterBadge active={false} label="ENS Updates" />
          <FilterBadge active={false} label="Education" />
        </div>
      </div>
      <NotificationsList />
    </div>
  )
}
