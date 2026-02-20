import { MessageCardTemplate } from '@/features/notifications/renderers/templates'
import { getNotificationActionButtonClass } from '@/features/notifications/ui/items/common'
import { isObject, isOptionalString, isString } from './helpers'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './types'

const isEnsUpdatePayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'ens-update'> => {
  if (!isObject(payload)) return false

  return (
    isString(payload.title) &&
    isString(payload.summary) &&
    isOptionalString(payload.url)
  )
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
