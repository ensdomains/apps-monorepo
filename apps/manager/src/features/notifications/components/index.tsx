import { useSelector } from '@xstate/store/react'
import { Cross, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
import { formatExpiryTime, formatRelativeTime } from '@/utils/time'
import {
  type NotificationWithId,
  notificationsStore,
} from '../stores/notifications'
import type {
  BlogPostNotification,
  NameExpiryNotification,
  NameTransferredNotification,
  Notification,
} from '../types'
import { groupNotificationsByTime } from '../utils'

// Shared UI components
const NotificationWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-2 border-gray-200 border-b px-4 py-6">{children}</div>
)

const NotificationHeader = ({
  children,
  timestamp,
  onMarkAsRead,
  onRemove,
}: {
  children?: React.ReactNode
  timestamp: number
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => (
  <div className="flex items-center gap-2">
    {children}
    <span className="ml-auto text-gray-500 text-sm">
      {formatRelativeTime(timestamp)}
    </span>

    {onRemove && (
      <button type="button" onClick={onRemove} className="cursor-pointer">
        <X className="size-5 text-gray-500" />
      </button>
    )}
  </div>
)

const NameDisplay = ({ name }: { name: string }) => (
  <div className="wrap-anywhere w-fit max-w-3/4 rounded-md bg-gray-800 p-1.5 font-mono text-sm text-white leading-ens-none">
    {name}
  </div>
)

const ActionRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end">{children}</div>
)

// Notification type components
const NameTransferredNotificationComponent = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: {
  notification: NameTransferredNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => (
  <NotificationWrapper>
    <NotificationHeader
      timestamp={notification.timestamp}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    >
      <Badge variant="lightBlue">Transferred</Badge>
    </NotificationHeader>
    <NameDisplay name={notification.name} />
    <ActionRow>
      <div className="flex items-center gap-2">
        <a
          href={`https://etherscan.io/tx/${notification.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 text-sm underline hover:text-blue-800"
        >
          View on Etherscan
        </a>
      </div>
    </ActionRow>
  </NotificationWrapper>
)

const NameExpiryNotificationComponent = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: {
  notification: NameExpiryNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => {
  const { text: expiryText, isExpired } = formatExpiryTime(
    notification.expiryDate,
  )

  return (
    <NotificationWrapper>
      <NotificationHeader
        timestamp={notification.timestamp}
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
      >
        <Badge variant="lightOrange">{expiryText}</Badge>
      </NotificationHeader>
      <NameDisplay name={notification.name} />
      <ActionRow>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAction}>
            {isExpired ? 'View' : 'Extend'}
          </Button>
        </div>
      </ActionRow>
    </NotificationWrapper>
  )
}

const BlogPostNotificationComponent = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: {
  notification: BlogPostNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => (
  <NotificationWrapper>
    <NotificationHeader
      timestamp={notification.timestamp}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    />
    <div className="flex gap-3">
      <div className="h-16 w-16 flex-shrink-0">
        <img
          src={notification.imageUrl}
          alt={notification.title}
          className="h-full w-full rounded object-cover"
        />
      </div>
      <div className="flex flex-col justify-center space-y-1">
        <h3 className="line-clamp-2 font-medium text-gray-900">
          {notification.title}
        </h3>
        <div className="flex items-center gap-2">
          <a
            href={notification.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onAction}
            className="text-blue-600 text-sm underline hover:text-blue-800"
          >
            Go to post
          </a>
        </div>
      </div>
    </div>
  </NotificationWrapper>
)

const NotificationItem = ({
  notification,
  onAction,
}: {
  notification: NotificationWithId
  onAction?: () => void
}) => {
  const handleMarkAsRead = () => {
    if (notification.unread) {
      notificationsStore.trigger.markAsRead({ notificationId: notification.id })
    }
  }

  const handleRemove = () => {
    notificationsStore.trigger.removeNotification({
      notificationId: notification.id,
    })
  }

  switch (notification.type) {
    case 'name-transferred':
      return (
        <NameTransferredNotificationComponent
          notification={notification}
          onAction={onAction}
          onMarkAsRead={handleMarkAsRead}
          onRemove={handleRemove}
        />
      )
    case 'name-expiry':
      return (
        <NameExpiryNotificationComponent
          notification={notification}
          onAction={onAction}
          onMarkAsRead={handleMarkAsRead}
          onRemove={handleRemove}
        />
      )
    case 'blog-post':
      return (
        <BlogPostNotificationComponent
          notification={notification}
          onAction={onAction}
          onMarkAsRead={handleMarkAsRead}
          onRemove={handleRemove}
        />
      )
    default:
      return null
  }
}

export const NotificationsDropdown = ({
  onAction,
}: {
  onAction?: () => void
}) => {
  const notifications = useSelector(
    notificationsStore,
    (state) => state.context.notifications,
  )

  const displayedNotifications = notifications.slice(0, 3)
  const unreadCount = notifications.filter((n) => n.unread).length

  const handleMarkAllAsRead = () => {
    notificationsStore.trigger.markAllAsRead()
  }

  return (
    <div className="">
      <div className="flex items-center justify-between pl-4">
        <h1 className="font-normal text-2xl">Notifications</h1>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            className="font-normal"
            onClick={handleMarkAllAsRead}
          >
            Mark all as read
          </Button>
        )}
      </div>

      <div>
        {displayedNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onAction={onAction}
          />
        ))}
      </div>

      {notifications.length > 3 && (
        <div className="border-gray-200 border-t px-4 py-3">
          <LinkButton
            to="/notifications/all"
            variant="ghost"
            className="w-full"
            onClick={onAction}
          >
            View all notifications
          </LinkButton>
        </div>
      )}
    </div>
  )
}

const NotificationGroup = ({
  title,
  notifications,
  onAction,
}: {
  title: string
  notifications: NotificationWithId[]
  onAction?: () => void
}) => {
  if (notifications.length === 0) return null

  return (
    <div className="">
      <h2 className="mb-2 px-4 font-medium text-gray-900 text-lg">{title}</h2>
      <div>
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  )
}

export const AllNotifications = ({ onAction }: { onAction?: () => void }) => {
  const notifications = useSelector(
    notificationsStore,
    (state) => state.context.notifications,
  )

  const { groups } = groupNotificationsByTime(notifications)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-normal text-2xl">All Notifications</h1>
        <LinkButton to="/notifications/settings" variant="link">
          Notification Settings
        </LinkButton>
      </div>

      {notifications.length === 0 ? (
        <div className="py-8 text-center text-gray-500">No notifications</div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <NotificationGroup
              key={group.title}
              title={group.title}
              notifications={group.notifications as NotificationWithId[]}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}
