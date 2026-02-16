import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ActionRow,
  NameDisplay,
  NotificationHeader,
  NotificationWrapper,
} from '@/features/notifications/components/items/common'
import { formatExpiryTime } from '@/utils/time'
import type { Kind, KindRendererProps } from './types'

const NameTransferredNotificationItem = ({
  payload,
  timestamp,
  onMarkAsRead,
  onRemove,
}: KindRendererProps<'name-transferred'>) => (
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

const NameExpiryNotificationItem = ({
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: KindRendererProps<'name-expiry'>) => {
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

const BlogPostBroadcastItem = ({
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: KindRendererProps<'blog-post'>) => (
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

export const kindOverrides = {
  'name-expiry': NameExpiryNotificationItem,
  'name-transferred': NameTransferredNotificationItem,
  'blog-post': BlogPostBroadcastItem,
} as const satisfies Partial<{ [K in Kind]: React.FC<KindRendererProps<K>> }>
