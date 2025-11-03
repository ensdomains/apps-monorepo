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

export type EmailDeliveryJob<K extends NotificationKind = NotificationKind> =
  BaseDeliveryJob<'email'> & {
    kind: K
    payload: NotificationPayloads[K]
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
  | {
      code: 'SENDGRID_API_ERROR'
      message: string
      field?: string
      help?: string
      statusCode?: number
    }
  | { code: 'SENDGRID_API_REQUEST_ERROR'; message: string }
  | { code: 'SENDGRID_API_RESPONSE_PARSE_ERROR'; message: string }
  | { code: 'DB_UPDATE_FAILED'; message: string }
  | { code: 'NOT_IMPLEMENTED'; message: string }
  | { code: 'UNKNOWN_CHANNEL'; message: string }
