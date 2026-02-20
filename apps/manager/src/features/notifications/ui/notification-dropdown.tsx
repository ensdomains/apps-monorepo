import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2Icon } from 'lucide-react'
import { MSymbol } from '@/components/ui/material-symbol'
import { notificationsInfiniteQuery } from '@/features/notifications/queries/notifications'
import { selectRenderableNotifications } from '@/features/notifications/renderers/kinds/selectors'
import { ResolvedNotificationItem } from './items/notification-item'
import { UnreadCount } from './unread-count'

interface NotificationsDropdownProps {
  onAction?: () => void
}

export const NotificationsDropdown = ({
  onAction,
}: NotificationsDropdownProps) => {
  const { data, isLoading, isError } = useInfiniteQuery(
    notificationsInfiniteQuery,
  )

  const notifications = selectRenderableNotifications(data ?? [], 3)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between">
          <div className="flex items-center gap-3">
            <div className="font-[350] font-serif text-2xl text-[#232222] leading-ens-none">
              Notifications
            </div>
            <UnreadCount />
          </div>
          <Link
            className="group flex items-center gap-2"
            onClick={() => onAction?.()}
            to="/notifications/settings"
          >
            <MSymbol className="ms-opsz-30 ms-wght-200" symbol="settings" />
          </Link>
        </div>
      </div>
      <Link
        className="ml-auto font-normal text-base text-ens-lapis-core leading-ens-normal hover:underline"
        onClick={() => onAction?.()}
        to="/notifications"
      >
        See all
      </Link>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center py-8">
          <Loader2Icon className="size-6 animate-spin text-[#717182]" />
        </div>
      ) : null}

      {isError ? (
        <div className="flex min-h-40 items-center justify-center py-8">
          <span className="text-[#717182] text-sm leading-ens-none">
            Failed to load notifications
          </span>
        </div>
      ) : null}

      {!isLoading && !isError && notifications.length > 0 ? (
        <div className="flex flex-col">
          {notifications.map((notification) => (
            <ResolvedNotificationItem
              key={notification.notification.id}
              layout="compact"
              onAction={onAction}
              resolved={notification}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !isError && notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-10">
          <MSymbol
            className="ms-opsz-72 ms-wght-200 text-[#515151]"
            symbol="drafts"
          />
          <span className="text-[#717182] text-sm leading-ens-none">
            Nothing here yet!
          </span>
        </div>
      ) : null}
    </div>
  )
}
