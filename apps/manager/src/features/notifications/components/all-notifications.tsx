import { useInfiniteQuery } from '@tanstack/react-query'
import { LinkButton } from '@/components/ui/button'
import {
  BackendNotification,
  notificationsInfiniteQuery,
} from '../queries/notifications'
import { groupNotificationsByTime } from '../utils'
import { NotificationItem } from './notification-items'

const NotificationGroup = ({
  title,
  notifications,
  onAction,
}: {
  title: string
  notifications: BackendNotification[]
  onAction?: () => void
}) => {
  if (notifications.length === 0) return null

  return (
    <div className="">
      <h2 className="mb-2 px-4 font-medium text-gray-900 text-lg">{title}</h2>
      <div>
        {notifications.map((notification, index) => (
          <NotificationItem
            key={`${notification.kind}-${notification.timestamp}-${index}`}
            notification={notification}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  )
}

export const AllNotifications = ({ onAction }: { onAction?: () => void }) => {
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

  const { groups } = groupNotificationsByTime(allNotifications)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-normal text-2xl">All Notifications</h1>
          <LinkButton to="/notifications/settings" variant="link">
            Notification Settings
          </LinkButton>
        </div>
        <div className="py-8 text-center text-muted-foreground text-sm">
          Loading notifications...
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-normal text-2xl">All Notifications</h1>
          <LinkButton to="/notifications/settings" variant="link">
            Notification Settings
          </LinkButton>
        </div>
        <div className="py-8 text-center text-destructive text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-normal text-2xl">All Notifications</h1>
        <LinkButton to="/notifications/settings" variant="link">
          Notification Settings
        </LinkButton>
      </div>

      {allNotifications.length === 0 ? (
        <div className="py-8 text-center text-gray-500">No notifications</div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <NotificationGroup
              key={group.title}
              title={group.title}
              notifications={group.notifications}
              onAction={onAction}
            />
          ))}

          {hasNextPage && (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full rounded-md border border-gray-200 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {isFetchingNextPage
                  ? 'Loading more...'
                  : 'Load more notifications'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
