import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { NameCardTemplate } from '@/features/notifications/renderers/templates'
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
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'name-expiry'>) => {
  const expiry = formatExpiryTime(notification.payload.expiryDate)

  return (
    <NameCardTemplate
      action={
        <Link
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 font-medium text-sm"
          onClick={onAction}
          params={{
            name: notification.payload.name,
          }}
          to="/p/$name"
        >
          {expiry.isExpired ? 'View' : 'Extend'}
        </Link>
      }
      badge={<Badge variant="lightOrange">{expiry.text}</Badge>}
      description={expiry.isExpired ? 'Name has expired' : undefined}
      name={notification.payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      timestamp={notification.timestamp}
    />
  )
}

export const nameExpiryKind: KindDefinition<'name-expiry'> = {
  kind: 'name-expiry',
  isValidPayload: isNameExpiryPayload,
  Component: NameExpiryComponent,
}
