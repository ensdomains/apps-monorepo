import type { Broadcasts, UserNotifications } from 'api-worker/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatExpiryTime } from '@/utils/time'
import type { BackendNotification } from '../../queries/notifications'
import {
  ActionRow,
  NameDisplay,
  NotificationHeader,
  NotificationWrapper,
} from './common'

type BaseItemProps = {
  timestamp: number
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

type NotificationItemProps<K extends keyof UserNotifications> = {
  payload: UserNotifications[K]
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
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      timestamp={timestamp}
    >
      <Badge variant="lightBlue">Transferred</Badge>
    </NotificationHeader>
    <NameDisplay name={payload.name} />
    <ActionRow>
      <div className="flex items-center gap-2">
        <a
          className="text-blue-600 text-sm underline hover:text-blue-800"
          href={`https://etherscan.io/tx/${payload.txHash}`}
          rel="noopener noreferrer"
          target="_blank"
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
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
        timestamp={timestamp}
      >
        <Badge variant="lightOrange">{expiryText}</Badge>
      </NotificationHeader>
      <NameDisplay name={payload.name} />
      <ActionRow>
        <div className="flex items-center gap-2">
          <Button onClick={onAction} size="sm" variant="outline">
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
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      timestamp={timestamp}
    />
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded">
        <img
          alt={payload.title}
          className="h-full w-full object-cover"
          src={payload.imageUrl}
        />
      </div>
      <div className="flex flex-col justify-center space-y-1">
        <h3 className="line-clamp-2 font-medium text-gray-900 leading-tight">
          {payload.title}
        </h3>
        <div className="flex items-center gap-2">
          <a
            className="text-blue-600 text-sm underline hover:text-blue-800"
            href={payload.url}
            onClick={onAction}
            rel="noopener noreferrer"
            target="_blank"
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
  [K in keyof UserNotifications]: React.FC<NotificationItemProps<K>>
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
  return (
    <Item
      onAction={onAction}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      payload={notification.payload as any}
      timestamp={notification.timestamp}
    />
  )
}
