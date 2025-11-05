import type {
  ChannelType,
  NotificationKind,
  NotificationPayloads,
} from '#config/notifications.js'

// Base delivery job
export type BaseDeliveryJob = {
  id: string
  notificationId: string
  userId: string
  kind: NotificationKind
}

// Channel-specific delivery jobs
export type TelegramDeliveryJob = BaseDeliveryJob

export type EmailDeliveryJob = BaseDeliveryJob

export type PushDeliveryJob = BaseDeliveryJob

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
