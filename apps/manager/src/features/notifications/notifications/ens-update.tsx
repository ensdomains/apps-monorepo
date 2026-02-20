import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { MessageCardTemplate } from '@/features/notifications/shared/templates'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './contracts'

const isEnsUpdatePayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'ens-update'> => {
  return v.safeParse(
    notificationDefinitions['ens-update'].payloadSchema,
    payload,
  ).success
}

const EnsUpdateComponent = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'ens-update'>) => (
  <MessageCardTemplate
    action={
      notification.payload.url ? (
        <a
          className={getNotificationActionButtonClass(layout)}
          href={notification.payload.url}
          onClick={onAction}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read more
        </a>
      ) : null
    }
    category="ENS Update"
    categoryTone="update"
    description={notification.payload.summary}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={notification.seen}
    timestamp={notification.timestamp}
    title={notification.payload.title}
  />
)

export const ensUpdateKind: KindDefinition<'ens-update'> = {
  kind: 'ens-update',
  isValidPayload: isEnsUpdatePayload,
  Component: EnsUpdateComponent,
}
