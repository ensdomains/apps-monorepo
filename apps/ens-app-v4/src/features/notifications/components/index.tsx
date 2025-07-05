import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
import { formatExpiryTime, formatRelativeTime } from '@/utils/time'
import type {
  BlogPostNotification,
  NameExpiryNotification,
  NameTransferredNotification,
  Notification,
} from '../types'
import { groupNotificationsByTime } from '../utils'

// Shared UI components
const NotificationWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-gray-200 py-6 space-y-2 px-4">{children}</div>
)

const NotificationHeader = ({
  badge,
  timestamp,
}: {
  badge: React.ReactNode
  timestamp: number
}) => (
  <div className="flex items-center justify-between">
    {badge}
    <span className="text-sm text-gray-500">
      {formatRelativeTime(timestamp)}
    </span>
  </div>
)

const NameDisplay = ({ name }: { name: string }) => (
  <div className="bg-gray-800 text-white p-1.5 leading-ens-none rounded-md font-mono text-sm w-fit max-w-3/4 wrap-anywhere">
    {name}
  </div>
)

const ActionRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end">{children}</div>
)

const TimestampOnly = ({ timestamp }: { timestamp: number }) => (
  <div className="flex justify-end">
    <span className="text-sm text-gray-500">
      {formatRelativeTime(timestamp)}
    </span>
  </div>
)

// Notification type components
const NameTransferredNotificationComponent = ({
  notification,
  onAction,
}: {
  notification: NameTransferredNotification
  onAction?: () => void
}) => (
  <NotificationWrapper>
    <NotificationHeader
      badge={<Badge variant="lightBlue">Transferred</Badge>}
      timestamp={notification.timestamp}
    />
    <NameDisplay name={notification.name} />
    <ActionRow>
      <a
        href={`https://etherscan.io/tx/${notification.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 text-sm underline"
      >
        View on Etherscan
      </a>
    </ActionRow>
  </NotificationWrapper>
)

const NameExpiryNotificationComponent = ({
  notification,
  onAction,
}: {
  notification: NameExpiryNotification
  onAction?: () => void
}) => {
  const { text: expiryText, isExpired } = formatExpiryTime(
    notification.expiryDate,
  )

  return (
    <NotificationWrapper>
      <NotificationHeader
        badge={<Badge variant="lightOrange">{expiryText}</Badge>}
        timestamp={notification.timestamp}
      />
      <NameDisplay name={notification.name} />
      <ActionRow>
        <Button variant="outline" size="sm" onClick={onAction}>
          {isExpired ? 'View' : 'Extend'}
        </Button>
      </ActionRow>
    </NotificationWrapper>
  )
}

const BlogPostNotificationComponent = ({
  notification,
  onAction,
}: {
  notification: BlogPostNotification
  onAction?: () => void
}) => (
  <NotificationWrapper>
    <TimestampOnly timestamp={notification.timestamp} />
    <div className="flex gap-3">
      <div className="w-16 h-16 flex-shrink-0">
        <img
          src={notification.imageUrl}
          alt={notification.title}
          className="w-full h-full object-cover rounded"
        />
      </div>
      <div className="flex flex-col justify-center space-y-1">
        <h3 className="font-medium text-gray-900 line-clamp-2">
          {notification.title}
        </h3>
        <a
          href={notification.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAction}
          className="text-blue-600 hover:text-blue-800 text-sm underline"
        >
          Go to post
        </a>
      </div>
    </div>
  </NotificationWrapper>
)

const NotificationItem = ({
  notification,
  onAction,
}: {
  notification: Notification
  onAction?: () => void
}) => {
  switch (notification.type) {
    case 'name-transferred':
      return (
        <NameTransferredNotificationComponent
          notification={notification}
          onAction={onAction}
        />
      )
    case 'name-expiry':
      return (
        <NameExpiryNotificationComponent
          notification={notification}
          onAction={onAction}
        />
      )
    case 'blog-post':
      return (
        <BlogPostNotificationComponent
          notification={notification}
          onAction={onAction}
        />
      )
    default:
      return null
  }
}

export const NotificationsDropdown = ({
  notifications,
  onAction,
}: {
  notifications: Notification[]
  onAction?: () => void
}) => {
  const displayedNotifications = notifications.slice(0, 3)

  return (
    <div className="">
      <div className="flex items-center justify-between pl-4">
        <h1 className="text-2xl font-normal">Notifications</h1>
        <Button variant="ghost" className="font-normal">
          Mark all as read
        </Button>
      </div>

      <div>
        {displayedNotifications.map((notification) => (
          <NotificationItem
            key={`${notification.type}-${notification.timestamp}`}
            notification={notification}
            onAction={onAction}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <LinkButton to="/notifications/all" variant="link" onClick={onAction}>
          View all notifications
        </LinkButton>
      </div>
    </div>
  )
}

const NotificationGroup = ({
  title,
  notifications,
}: {
  title: string
  notifications: Notification[]
}) => {
  if (notifications.length === 0) return null

  return (
    <div className="">
      <h2 className="text-lg font-medium text-gray-900 mb-2 px-4">{title}</h2>
      <div>
        {notifications.map((notification) => (
          <NotificationItem
            key={`${notification.type}-${notification.timestamp}`}
            notification={notification}
          />
        ))}
      </div>
    </div>
  )
}

export const AllNotifications = ({
  notifications,
}: {
  notifications: Notification[]
}) => {
  const { groups } = groupNotificationsByTime(notifications)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-2xl font-normal">All Notifications</h1>
        <LinkButton to="/notifications/settings" variant="link">
          Notification Settings
        </LinkButton>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <NotificationGroup
            key={group.title}
            title={group.title}
            notifications={group.notifications}
          />
        ))}

        {notifications.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No notifications yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
