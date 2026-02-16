import type { BackendNotification } from '../queries/notifications'

export const selectLatestNotifications = (
  notifications: BackendNotification[],
  limit: number,
): BackendNotification[] => notifications.slice(0, limit)
