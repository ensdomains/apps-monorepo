import { Link } from '@tanstack/react-router'
import { NameCardTemplate } from '@/features/notifications/renderers/templates'
import { getNotificationActionButtonClass } from '@/features/notifications/ui/items/common'
import { formatExpiryTime } from '@/utils/time'
import { isBoolean, isNumber, isObject, isString } from './helpers'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './types'

const isNameExpiryPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'name-expiry'> => {
  if (!isObject(payload)) return false

  return (
    isString(payload.name) &&
    isNumber(payload.expiryDate) &&
    isBoolean(payload.isOwner) &&
    (payload.watchReason === 'owned' ||
      payload.watchReason === 'favourited' ||
      payload.watchReason === 'manual')
  )
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
