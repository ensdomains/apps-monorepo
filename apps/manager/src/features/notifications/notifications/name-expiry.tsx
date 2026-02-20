import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import { Link } from '@tanstack/react-router'
import * as v from 'valibot'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { NameCardTemplate } from '@/features/notifications/shared/templates'
import { formatExpiryTime } from '@/utils/time'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './contracts'

const isNameExpiryPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'name-expiry'> => {
  return v.safeParse(
    notificationDefinitions['name-expiry'].payloadSchema,
    payload,
  ).success
}

const NameExpiryComponent = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'name-expiry'>) => {
  const expiry = formatExpiryTime(notification.payload.expiryDate)

  return (
    <NameCardTemplate
      action={
        <Link
          className={getNotificationActionButtonClass(layout)}
          onClick={onAction}
          params={{
            name: notification.payload.name,
          }}
          to="/p/$name"
        >
          {expiry.isExpired ? 'View profile' : 'Extend'}
        </Link>
      }
      category="Expiry"
      categoryTone="warning"
      description={
        expiry.isExpired
          ? 'This name has expired and should be renewed as soon as possible.'
          : undefined
      }
      layout={layout}
      name={notification.payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={notification.seen}
      statusText={expiry.text}
      timestamp={notification.timestamp}
    />
  )
}

export const nameExpiryKind: KindDefinition<'name-expiry'> = {
  kind: 'name-expiry',
  isValidPayload: isNameExpiryPayload,
  Component: NameExpiryComponent,
}
