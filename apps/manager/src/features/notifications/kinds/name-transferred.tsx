import { Badge } from '@/components/ui/badge'
import { NameCardTemplate } from '@/features/notifications/renderers/templates'
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
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'name-transferred'>) => (
  <NameCardTemplate
    action={
      <a
        className="text-blue-600 text-sm underline hover:text-blue-800"
        href={`https://etherscan.io/tx/${notification.payload.txHash}`}
        onClick={onAction}
        rel="noopener noreferrer"
        target="_blank"
      >
        View on Etherscan
      </a>
    }
    badge={<Badge variant="lightBlue">Transferred</Badge>}
    name={notification.payload.name}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    timestamp={notification.timestamp}
  />
)

export const nameTransferredKind: KindDefinition<'name-transferred'> = {
  kind: 'name-transferred',
  isValidPayload: isNameTransferredPayload,
  Component: NameTransferredComponent,
}
