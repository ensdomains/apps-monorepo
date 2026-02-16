import type { ReactNode } from 'react'
import {
  ActionRow,
  NameDisplay,
  NotificationHeader,
  NotificationWrapper,
} from '@/features/notifications/ui/items/common'

type TemplateCommonProps = {
  timestamp: number
  onMarkAsRead?: () => void
  onRemove?: () => void
}

type NameCardTemplateProps = TemplateCommonProps & {
  badge?: ReactNode
  name: string
  description?: string
  action?: ReactNode
}

export const NameCardTemplate = ({
  badge,
  name,
  description,
  action,
  timestamp,
  onMarkAsRead,
  onRemove,
}: NameCardTemplateProps) => (
  <NotificationWrapper>
    <NotificationHeader
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      timestamp={timestamp}
    >
      {badge}
    </NotificationHeader>
    <NameDisplay name={name} />
    {description ? (
      <div className="text-gray-600 text-sm">{description}</div>
    ) : null}
    {action ? <ActionRow>{action}</ActionRow> : null}
  </NotificationWrapper>
)

type ContentCardTemplateProps = TemplateCommonProps & {
  title: string
  imageUrl?: string
  description?: string
  action?: ReactNode
}

export const ContentCardTemplate = ({
  title,
  imageUrl,
  description,
  action,
  timestamp,
  onMarkAsRead,
  onRemove,
}: ContentCardTemplateProps) => (
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
        {description ? (
          <p className="text-gray-600 text-sm">{description}</p>
        ) : null}
        {action}
      </div>
    </div>
  </NotificationWrapper>
)

type MessageCardTemplateProps = TemplateCommonProps & {
  title: string
  description?: string
  action?: ReactNode
}

export const MessageCardTemplate = ({
  title,
  description,
  action,
  timestamp,
  onMarkAsRead,
  onRemove,
}: MessageCardTemplateProps) => (
  <NotificationWrapper>
    <NotificationHeader
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      timestamp={timestamp}
    />
    <div className="space-y-1">
      <div className="font-medium text-gray-900">{title}</div>
      {description ? (
        <div className="text-gray-600 text-sm">{description}</div>
      ) : null}
      {action}
    </div>
  </NotificationWrapper>
)
