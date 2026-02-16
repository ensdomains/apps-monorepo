import type { BackendNotification } from '../queries/notifications'
import {
  type RenderableNotification,
  resolveRenderableNotification,
} from './index'

const logDroppedNotification = (
  notification: BackendNotification,
  reason: 'invalid' | 'unknown-kind',
) => {
  if (!import.meta.env.DEV) return

  console.debug('[notifications] dropped notification from UI', {
    id: notification.id,
    kind: notification.kind,
    reason,
  })
}

/**
 * Resolve and keep only renderable notifications.
 * Invalid payloads and unknown kinds are filtered out.
 */
export const selectRenderableNotifications = (
  notifications: BackendNotification[],
  limit?: number,
): RenderableNotification[] => {
  const renderable: RenderableNotification[] = []

  for (const notification of notifications) {
    const resolved = resolveRenderableNotification(notification)

    if (resolved.type === 'renderable') {
      renderable.push(resolved)
      if (limit !== undefined && renderable.length >= limit) break
      continue
    }

    logDroppedNotification(notification, resolved.type)
  }

  return renderable
}
