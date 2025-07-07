import { TIME_UNITS } from '@/utils/time'
import type { Notification } from './types'

export const groupNotificationsByTime = (notifications: Notification[]) => {
  if (notifications.length === 0) {
    return { groups: [] }
  }

  const now = Date.now()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()

  const yesterday = new Date(todayStart - TIME_UNITS.DAY)
  const yesterdayStart = yesterday.getTime()

  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() - today.getDay()) // Start of current week (Sunday)
  const thisWeekStartTime = thisWeekStart.getTime()

  const lastWeekStart = thisWeekStartTime - 7 * TIME_UNITS.DAY

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const thisMonthStartTime = thisMonthStart.getTime()

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthStartTime = lastMonthStart.getTime()

  const threeMonthsAgo = now - 90 * TIME_UNITS.DAY
  const sixMonthsAgo = now - 180 * TIME_UNITS.DAY
  const oneYearAgo = now - 365 * TIME_UNITS.DAY

  // Sort notifications by timestamp (newest first)
  const sortedNotifications = [...notifications].sort(
    (a, b) => b.timestamp - a.timestamp,
  )

  const groups: { title: string; notifications: Notification[] }[] = []

  const addGroup = (title: string, notifications: Notification[]) => {
    if (notifications.length > 0) {
      groups.push({ title, notifications })
    }
  }

  // Group notifications
  const today_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= todayStart,
  )
  const yesterday_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= yesterdayStart && n.timestamp < todayStart,
  )
  const thisWeek_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= thisWeekStartTime && n.timestamp < yesterdayStart,
  )
  const lastWeek_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= lastWeekStart && n.timestamp < thisWeekStartTime,
  )
  const thisMonth_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= thisMonthStartTime && n.timestamp < lastWeekStart,
  )
  const lastMonth_notifications = sortedNotifications.filter(
    (n) =>
      n.timestamp >= lastMonthStartTime && n.timestamp < thisMonthStartTime,
  )
  const recent_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= threeMonthsAgo && n.timestamp < lastMonthStartTime,
  )
  const older_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= sixMonthsAgo && n.timestamp < threeMonthsAgo,
  )
  const muchOlder_notifications = sortedNotifications.filter(
    (n) => n.timestamp >= oneYearAgo && n.timestamp < sixMonthsAgo,
  )
  const ancient_notifications = sortedNotifications.filter(
    (n) => n.timestamp < oneYearAgo,
  )

  // Add groups in chronological order
  addGroup('Today', today_notifications)
  addGroup('Yesterday', yesterday_notifications)
  addGroup('This week', thisWeek_notifications)
  addGroup('Last week', lastWeek_notifications)
  addGroup('This month', thisMonth_notifications)
  addGroup('Last month', lastMonth_notifications)
  addGroup('Last 3 months', recent_notifications)
  addGroup('Last 6 months', older_notifications)
  addGroup('Last year', muchOlder_notifications)
  addGroup('Older', ancient_notifications)

  return { groups }
}
