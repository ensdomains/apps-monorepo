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
        <Link
          className={getNotificationActionButtonClass(layout)}
          onClick={onAction}
          params={{
            name: payload.name,
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
      name={payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      statusText={expiry.text}
      timestamp={timestamp}
    />
  )
}
