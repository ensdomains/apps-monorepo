import type { Notification } from '../types'
import {
  BlogPostNotificationItem,
  NameExpiryNotificationItem,
  NameTransferredNotificationItem,
} from './notification-items'

export const NotificationItem = ({
  notification,
  onAction,
}: {
  notification: Notification
  onAction?: () => void
}) => {
  const handleMarkAsRead = () => {
    if (notification.unread) {
      // TODO: Implement mark as read API call
      console.log('Mark as read:', notification)
    }
  }

  const handleRemove = () => {
    // TODO: Implement remove notification API call
    console.log('Remove notification:', notification)
  }

  switch (notification.type) {
    case 'name-transferred':
      return (
        <NameTransferredNotificationItem
          notification={notification}
          onAction={onAction}
          onMarkAsRead={handleMarkAsRead}
          onRemove={handleRemove}
        />
      )
    case 'name-expiry':
      return (
        <NameExpiryNotificationItem
          notification={notification}
          onAction={onAction}
          onMarkAsRead={handleMarkAsRead}
          onRemove={handleRemove}
        />
      )
    case 'blog-post':
      return (
        <BlogPostNotificationItem
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
