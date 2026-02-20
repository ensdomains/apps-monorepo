import { MessageCardTemplate } from '@/features/notifications/renderers/templates'
import { getNotificationActionButtonClass } from '@/features/notifications/ui/items/common'
import { isObject, isOptionalString, isString } from './helpers'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './types'

const isAlphaWelcomePayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'alpha-welcome'> => {
  if (!isObject(payload)) return false

  return (
    isString(payload.title) &&
    isString(payload.body) &&
    isOptionalString(payload.ctaLabel) &&
    isOptionalString(payload.ctaUrl)
  )
}

const AlphaWelcomeComponent = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'alpha-welcome'>) => (
  <MessageCardTemplate
    action={
      notification.payload.ctaLabel && notification.payload.ctaUrl ? (
        <a
          className={getNotificationActionButtonClass(layout)}
          href={notification.payload.ctaUrl}
          onClick={onAction}
          rel="noopener noreferrer"
          target="_blank"
        >
          {notification.payload.ctaLabel}
        </a>
      ) : null
    }
    category="ENS Update"
    categoryTone="update"
    description={notification.payload.body}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={notification.seen}
    timestamp={notification.timestamp}
    title={notification.payload.title}
  />
)

export const alphaWelcomeKind: KindDefinition<'alpha-welcome'> = {
  kind: 'alpha-welcome',
  isValidPayload: isAlphaWelcomePayload,
  Component: AlphaWelcomeComponent,
}
