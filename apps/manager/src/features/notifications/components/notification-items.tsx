import type { Broadcasts, Notifications } from 'api-worker/types/notifications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatExpiryTime } from '@/utils/time'
import type { BackendNotification } from '../queries/notifications'
import {
  ActionRow,
  NameDisplay,
  NotificationHeader,
  NotificationWrapper,
} from './shared'

type BaseItemProps = {
  timestamp: number
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

type NotificationItemProps<K extends keyof Notifications> = {
  payload: Notifications[K]
} & BaseItemProps

type BroadcastItemProps<K extends keyof Broadcasts> = {
  payload: Broadcasts[K]
} & BaseItemProps

const NameTransferredNotificationItem = ({
  payload,
  timestamp,
  onMarkAsRead,
  onRemove,
}: NotificationItemProps<'name-transferred'>) => (
  <NotificationWrapper>
    <NotificationHeader
      timestamp={timestamp}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    >
      <Badge variant="lightBlue">Transferred</Badge>
    </NotificationHeader>
    <NameDisplay name={payload.name} />
    <ActionRow>
      <div className="flex items-center gap-2">
        <a
          href={`https://etherscan.io/tx/${payload.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 text-sm underline hover:text-blue-800"
        >
          View on Etherscan
        </a>
      </div>
    </ActionRow>
  </NotificationWrapper>
)

export const NameExpiryNotificationItem = ({
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: NotificationItemProps<'name-expiry'>) => {
  const { text: expiryText, isExpired } = formatExpiryTime(payload.expiryDate)

  return (
    <NotificationWrapper>
      <NotificationHeader
        timestamp={timestamp}
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
      >
        <Badge variant="lightOrange">{expiryText}</Badge>
      </NotificationHeader>
      <NameDisplay name={payload.name} />
      <ActionRow>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAction}>
            {isExpired ? 'View' : 'Extend'}
          </Button>
        </div>
      </ActionRow>
    </NotificationWrapper>
  )
}

export const BlogPostBroadcastItem = ({
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: BroadcastItemProps<'blog-post'>) => (
  <NotificationWrapper>
    <NotificationHeader
      timestamp={timestamp}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    />
    <div className="flex gap-3">
      <div className="h-16 w-16 flex-shrink-0">
        <img
          src={payload.imageUrl}
          alt={payload.title}
          className="h-full w-full rounded object-cover"
        />
      </div>
      <div className="flex flex-col justify-center space-y-1">
        <h3 className="line-clamp-2 font-medium text-gray-900">
          {payload.title}
        </h3>
        <div className="flex items-center gap-2">
          <a
            href={payload.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onAction}
            className="text-blue-600 text-sm underline hover:text-blue-800"
          >
            Go to post
          </a>
        </div>
      </div>
    </div>
  </NotificationWrapper>
)

export const NotificationItems = {
  'name-expiry': NameExpiryNotificationItem,
  'name-transferred': NameTransferredNotificationItem,
  'blog-post': BlogPostBroadcastItem,
} satisfies {
  [K in keyof Notifications]: React.FC<NotificationItemProps<K>>
} & { [K in keyof Broadcasts]: React.FC<BroadcastItemProps<K>> }

export const NotificationItem = ({
  notification,
  onAction,
  onMarkAsRead,
  onRemove,
}: {
  notification: BackendNotification
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => {
  const Item = NotificationItems[notification.kind]
  console.log(notification)
  return (
    <Item
      payload={notification.payload as any}
      timestamp={notification.timestamp}
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
    />
  )
}
