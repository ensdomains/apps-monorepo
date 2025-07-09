import { createStore } from '@xstate/store'
import { produce } from 'immer'
import { MOCK_NOTIFICATIONS } from '../MOCK'
import type { Notification } from '../types'

// Add unique IDs to notifications for better management
export type NotificationWithId = Notification & {
  id: string
}

const addIdsToNotifications = (
  notifications: Notification[],
): NotificationWithId[] => {
  return notifications.map((notification, index) => ({
    ...notification,
    id: `${notification.type}-${notification.timestamp}-${index}`,
  }))
}

export const notificationsStore = createStore({
  context: {
    notifications: addIdsToNotifications(MOCK_NOTIFICATIONS),
  },
  on: {
    markAsRead: (context, event: { notificationId: string }) =>
      produce(context, (draft) => {
        const notification = draft.notifications.find(
          (n) => n.id === event.notificationId,
        )
        if (notification) {
          notification.unread = false
        }
      }),
    markAllAsRead: (context) =>
      produce(context, (draft) => {
        draft.notifications.forEach((notification) => {
          notification.unread = false
        })
      }),
    removeNotification: (context, event: { notificationId: string }) =>
      produce(context, (draft) => {
        draft.notifications = draft.notifications.filter(
          (notification) => notification.id !== event.notificationId,
        )
      }),
    addNotification: (
      context,
      event: { notification: Notification; sorted?: boolean },
    ) =>
      produce(context, (draft) => {
        draft.notifications.unshift({
          ...event.notification,
          id: `${event.notification.type}-${event.notification.timestamp}-${Date.now()}`,
        })

        if (event.sorted) {
          draft.notifications.sort((a, b) => b.timestamp - a.timestamp)
        }
      }),
    clearAllNotifications: (context) =>
      produce(context, (draft) => {
        draft.notifications = []
      }),
  },
})
