import { NameCardTemplate } from '@/features/notifications/renderers/templates'
import { getNotificationActionButtonClass } from '@/features/notifications/ui/items/common'
import { isObject, isString } from './helpers'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './types'

const isNameTransferredPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'name-transferred'> => {
  if (!isObject(payload)) return false

  return (
    isString(payload.name) && isString(payload.txHash) && isString(payload.to)
  )
}

const NameTransferredComponent = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'name-transferred'>) => (
  <NameCardTemplate
    action={
      <a
        className={getNotificationActionButtonClass(layout)}
        href={`https://etherscan.io/tx/${notification.payload.txHash}`}
        onClick={onAction}
        rel="noopener noreferrer"
        target="_blank"
      >
        View tx
      </a>
    }
    category="Activity"
    categoryTone="default"
    layout={layout}
    name={notification.payload.name}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={notification.seen}
    statusText="Transferred"
    timestamp={notification.timestamp}
  />
)

export const nameTransferredKind: KindDefinition<'name-transferred'> = {
  kind: 'name-transferred',
  isValidPayload: isNameTransferredPayload,
  Component: NameTransferredComponent,
}
