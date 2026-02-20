import { useMemo } from 'react'
import { safeParse } from 'valibot'
import type { BackendNotification } from '@/features/notifications/data/queries/notifications'
import { getNotificationData } from '@/features/notifications/notifications'
import type { NotificationLayout } from '@/features/notifications/notifications/contracts'

type NotificationItemProps = {
  notification: BackendNotification
  layout?: NotificationLayout
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

export const NotificationItem = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: NotificationItemProps) => {
  type NotificationKind = typeof notification.kind
  const { Component, definition } = getNotificationData<NotificationKind>(
    notification.kind,
  )

  const validPayload = useMemo(() => {
    return safeParse(definition.payloadSchema, notification.payload).success
  }, [notification.payload, definition.payloadSchema])

  if (!Component || !validPayload) {
    return null
  }

  return (
    <Component
      layout={layout}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      // biome-ignore lint/suspicious/noExplicitAny: Can't type this properly
      payload={notification.payload as any}
      seen={notification.seen}
      timestamp={notification.timestamp}
    />
  )
}
