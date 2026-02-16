import { Button } from '@/components/ui/button'
import {
  ActionRow,
  NameDisplay,
  NotificationHeader,
  NotificationWrapper,
} from '@/features/notifications/components/items/common'
import { getCatalogItem } from '@/features/notifications/model/catalog'
import type { NotificationRenderer, NotificationRendererProps } from './types'

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined

const getTemplateActionLabel = (kind: string) => {
  const item = getCatalogItem(kind)

  if (!item) {
    return 'Open'
  }

  if ('action' in item.ui && item.ui.action) {
    return item.ui.action.label
  }

  return 'Open'
}

const NameCardTemplate = ({
  notification,
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: NotificationRendererProps) => {
  const payloadRecord = readRecord(payload)
  const name = readString(payloadRecord?.name)
  const expiryDate = readNumber(payloadRecord?.expiryDate)

  return (
    <NotificationWrapper>
      <NotificationHeader
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
        timestamp={timestamp}
      />
      {name ? <NameDisplay name={name} /> : null}
      {expiryDate ? (
        <div className="text-gray-500 text-sm">
          {new Date(expiryDate).toLocaleDateString()}
        </div>
      ) : null}
      {onAction ? (
        <ActionRow>
          <Button onClick={onAction} size="sm" variant="outline">
            {getTemplateActionLabel(notification.kind)}
          </Button>
        </ActionRow>
      ) : null}
    </NotificationWrapper>
  )
}

const ContentCardTemplate = ({
  notification,
  payload,
  timestamp,
  onAction,
  onMarkAsRead,
  onRemove,
}: NotificationRendererProps) => {
  const payloadRecord = readRecord(payload)
  const title = readString(payloadRecord?.title) ?? 'Update'
  const imageUrl = readString(payloadRecord?.imageUrl)
  const url = readString(payloadRecord?.url)

  return (
    <NotificationWrapper>
      <NotificationHeader
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
        timestamp={timestamp}
      />
      <div className="flex items-center gap-4">
        {imageUrl ? (
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded">
            <img
              alt={title}
              className="h-full w-full object-cover"
              src={imageUrl}
            />
          </div>
        ) : null}
        <div className="flex flex-col justify-center gap-1">
          <h3 className="line-clamp-2 font-medium text-gray-900 leading-tight">
            {title}
          </h3>
          {url ? (
            <a
              className="text-blue-600 text-sm underline hover:text-blue-800"
              href={url}
              onClick={onAction}
              rel="noopener noreferrer"
              target="_blank"
            >
              {getTemplateActionLabel(notification.kind)}
            </a>
          ) : null}
        </div>
      </div>
    </NotificationWrapper>
  )
}

const MessageCardTemplate = ({
  notification,
  payload,
  timestamp,
  onMarkAsRead,
  onRemove,
}: NotificationRendererProps) => {
  const payloadRecord = readRecord(payload)
  const title =
    readString(payloadRecord?.title) ??
    getCatalogItem(notification.kind)?.metadata.label
  const body =
    readString(payloadRecord?.body) ??
    readString(payloadRecord?.summary) ??
    getCatalogItem(notification.kind)?.metadata.description

  return (
    <NotificationWrapper>
      <NotificationHeader
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
        timestamp={timestamp}
      />
      <div className="space-y-1">
        {title ? (
          <div className="font-medium text-gray-900">{title}</div>
        ) : null}
        {body ? <div className="text-gray-600 text-sm">{body}</div> : null}
      </div>
    </NotificationWrapper>
  )
}

export const UnknownNotificationRenderer: NotificationRenderer = ({
  notification,
  timestamp,
  onMarkAsRead,
  onRemove,
}) => {
  const metadata = getCatalogItem(notification.kind)?.metadata

  return (
    <NotificationWrapper>
      <NotificationHeader
        onMarkAsRead={onMarkAsRead}
        onRemove={onRemove}
        timestamp={timestamp}
      />
      <div className="space-y-1">
        <div className="font-medium text-gray-900">
          {metadata?.label ?? 'Notification'}
        </div>
        <div className="text-gray-600 text-sm">
          {metadata?.description ??
            'This notification type is not available yet.'}
        </div>
      </div>
    </NotificationWrapper>
  )
}

export const templateRenderers = {
  'name-card': NameCardTemplate,
  'content-card': ContentCardTemplate,
  'message-card': MessageCardTemplate,
} as const satisfies Record<string, NotificationRenderer>
