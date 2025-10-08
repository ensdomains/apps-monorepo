import type {
  ChannelType,
  NotificationKind,
  NotificationPayloads,
} from '#config/notifications.js'

// Base delivery job
export type BaseDeliveryJob<C extends ChannelType> = {
  id: string
  notificationId: string
  userId: string
  channel: C
  target: string
  attempts: number
  maxAttempts: number
}

// Channel-specific delivery jobs
export type TelegramDeliveryJob = BaseDeliveryJob<'telegram'> & {
  kind: NotificationKind
  payload: NotificationPayloads[NotificationKind]
}

export type EmailDeliveryJob = BaseDeliveryJob<'email'> & {
  kind: NotificationKind
  payload: NotificationPayloads[NotificationKind]
}

export type PushDeliveryJob = BaseDeliveryJob<'push'> & {
  kind: NotificationKind
  payload: NotificationPayloads[NotificationKind]
}

export type AnyDeliveryJob =
  | TelegramDeliveryJob
  | EmailDeliveryJob
  | PushDeliveryJob

// Delivery error types
export type DeliveryError =
  | { code: 'UNSUPPORTED_NOTIFICATION_TYPE'; message: string }
  | { code: 'TELEGRAM_API_ERROR'; message: string; errorCode?: number }
  | { code: 'DB_UPDATE_FAILED'; message: string }
  | { code: 'NOT_IMPLEMENTED'; message: string }
  | { code: 'UNKNOWN_CHANNEL'; message: string }
