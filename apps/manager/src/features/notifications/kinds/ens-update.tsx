import { MessageCardTemplate } from '@/features/notifications/renderers/templates'
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
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'ens-update'>) => (
  <MessageCardTemplate
    action={
      notification.payload.url ? (
        <a
          className="text-blue-600 text-sm underline hover:text-blue-800"
          href={notification.payload.url}
          onClick={onAction}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read more
        </a>
      ) : null
    }
    description={notification.payload.summary}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    timestamp={notification.timestamp}
    title={notification.payload.title}
  />
)

export const ensUpdateKind: KindDefinition<'ens-update'> = {
  kind: 'ens-update',
  isValidPayload: isEnsUpdatePayload,
  Component: EnsUpdateComponent,
}
