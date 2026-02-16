import type { FC } from 'react'
import {
  type RenderableNotification,
  resolveRenderableNotification,
} from '../../kinds'
import type { KindComponentProps, NotificationKind } from '../../kinds/types'
import type { BackendNotification } from '../../queries/notifications'

type NotificationItemProps = {
  notification: BackendNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

type ResolvedNotificationItemProps = Omit<
  NotificationItemProps,
  'notification'
> & {
  resolved: RenderableNotification
}

const getRenderableComponent = (resolved: RenderableNotification) =>
  resolved.definition.Component as FC<KindComponentProps<NotificationKind>>

export const ResolvedNotificationItem = ({
  resolved,
  onAction,
  onMarkAsRead,
  onRemove,
}: ResolvedNotificationItemProps) => {
  const Component = getRenderableComponent(resolved)

  return (
    <Component
      notification={resolved.notification}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    />
  )
}

export const NotificationItem = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: NotificationItemProps) => {
  const resolved = resolveRenderableNotification(notification)

  if (resolved.type !== 'renderable') {
    return null
  }

  return (
    <ResolvedNotificationItem
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      resolved={resolved}
    />
  )
}
