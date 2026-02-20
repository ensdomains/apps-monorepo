import type { FC } from 'react'
import type { BackendNotification } from '@/features/notifications/data/queries/notifications'
import {
  type RenderableNotification,
  resolveRenderableNotification,
} from '@/features/notifications/notifications'
import type {
  KindComponentProps,
  NotificationKind,
  NotificationLayout,
} from '@/features/notifications/notifications/contracts'

type NotificationItemProps = {
  notification: BackendNotification
  layout?: NotificationLayout
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
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: ResolvedNotificationItemProps) => {
  const Component = getRenderableComponent(resolved)

  return (
    <Component
      layout={layout}
      notification={resolved.notification}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    />
  )
}

export const NotificationItem = ({
  notification,
  layout = 'default',
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
      layout={layout}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      resolved={resolved}
    />
  )
}
