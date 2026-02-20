import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { MessageCardTemplate } from '@/features/notifications/shared/templates'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './contracts'

const isAlphaWelcomePayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'alpha-welcome'> => {
  return v.safeParse(
    notificationDefinitions['alpha-welcome'].payloadSchema,
    payload,
  ).success
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
