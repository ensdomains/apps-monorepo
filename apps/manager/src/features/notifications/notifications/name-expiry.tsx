import { Link } from '@tanstack/react-router'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { NameCardTemplate } from '@/features/notifications/shared/templates'
import { formatExpiryTime } from '@/utils/time'
import type { KindComponent } from './contracts'

export const NameExpiryComponent: KindComponent<'name-expiry'> = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}) => {
  const expiry = formatExpiryTime(payload.expiryDate)

  return (
    <NameCardTemplate
      action={
        expiry.isExpired ? (
          <Link
            className={getNotificationActionButtonClass(layout)}
            onClick={onAction}
            params={{
              name: payload.name,
            }}
            to="/register/$name"
          >
            Register Name
          </Link>
        ) : (
          <Link
            className={getNotificationActionButtonClass(layout)}
            onClick={onAction}
            params={{
              name: payload.name,
            }}
            to="/renew/$name"
          >
            Renew Now
          </Link>
        )
      }
      category="Expiry"
      categoryTone="warning"
      description={
        expiry.isExpired
          ? 'This name has expired and is now available to register.'
          : 'This name is expiring soon and should be renewed as soon as possible.'
      }
      layout={layout}
      name={payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      statusText={expiry.text}
      timestamp={timestamp}
    />
  )
}
