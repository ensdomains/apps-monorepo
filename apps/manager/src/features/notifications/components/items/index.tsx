import type { BackendNotification } from '../../queries/notifications'
import { resolveNotificationRenderer } from '../../renderers/resolve-notification-renderer'

export const NotificationItem = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: {
  notification: BackendNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => {
  const Item = resolveNotificationRenderer(notification.kind)

  return (
    <Item
      notification={notification}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      payload={notification.payload}
      timestamp={notification.timestamp}
    />
  )
}
