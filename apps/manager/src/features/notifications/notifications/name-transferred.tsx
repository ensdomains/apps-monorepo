import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { NameCardTemplate } from '@/features/notifications/shared/templates'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './contracts'

const isNameTransferredPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'name-transferred'> => {
  return v.safeParse(
    notificationDefinitions['name-transferred'].payloadSchema,
    payload,
  ).success
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
