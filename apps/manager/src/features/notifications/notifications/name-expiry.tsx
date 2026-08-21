import { Link } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { NameCardTemplate } from '@/features/notifications/shared/templates'
import type { KindComponent } from './contracts'
import { getNameExpiryPresentation } from './name-expiry.presentation'

export const NameExpiryComponent: KindComponent<'name-expiry'> = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}) => {
  const presentation = getNameExpiryPresentation(payload)
  const actionClassName = getNotificationActionButtonClass(layout)
  const action = match(presentation.action)
    .with('renew', () => (
      <Link
        className={actionClassName}
        onClick={onAction}
        params={{ name: payload.name }}
        to={presentation.renewTo}
      >
        {presentation.actionLabel}
      </Link>
    ))
    .with('register', () => (
      <Link
        className={actionClassName}
        onClick={onAction}
        params={{ name: payload.name }}
        to="/register/$name"
      >
        {presentation.actionLabel}
      </Link>
    ))
    .with('none', () => undefined)
    .exhaustive()

  return (
    <NameCardTemplate
      action={action}
      category="Expiry"
      categoryTone="warning"
      description={presentation.description}
      layout={layout}
      name={payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      statusText={presentation.statusText}
      timestamp={timestamp}
    />
  )
}
