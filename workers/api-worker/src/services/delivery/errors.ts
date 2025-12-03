import { TaggedError } from '@ens-apps/utils/neverthrow'

export class UnsupportedNotificationTypeError extends TaggedError(
  'UNSUPPORTED_NOTIFICATION_TYPE',
) {}

export class NotificationDeliveryNotFoundError extends TaggedError(
  'NOTIFICATION_DELIVERY_NOT_FOUND',
) {}
