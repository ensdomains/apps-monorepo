import type { ReactNode } from 'react'
import {
  MediaThumb,
  NameDisplay,
  NotificationBody,
  NotificationHeader,
  type NotificationPillTone,
  NotificationWrapper,
} from '@/features/notifications/shared/primitives'

type TemplateCommonProps = {
  category: string
  categoryTone?: NotificationPillTone
  seen: boolean
  timestamp: number
  layout?: 'default' | 'compact'
  onMarkAsRead?: () => void
  onRemove?: () => void
}

type NameCardTemplateProps = TemplateCommonProps & {
  statusText?: string
  name: string
  description?: string
  action?: ReactNode
}

export const NameCardTemplate = ({
  category,
  categoryTone,
  seen,
  statusText,
  name,
  description,
  action,
  timestamp,
  layout = 'default',
  onMarkAsRead,
  onRemove,
}: NameCardTemplateProps) => (
  <NotificationWrapper>
    <NotificationHeader
      category={category}
      categoryTone={categoryTone}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      timestamp={timestamp}
    />
    <NotificationBody
      action={action}
      main={
        <div className="space-y-2">
          {statusText ? (
            <p className="font-medium text-[#6a6d7d] text-sm">{statusText}</p>
          ) : null}
          <NameDisplay layout={layout} name={name} />
          {description ? (
            <p className="text-[#5f6172] text-sm leading-snug">{description}</p>
          ) : null}
        </div>
      }
    />
  </NotificationWrapper>
)

type ContentCardTemplateProps = TemplateCommonProps & {
  title: string
  imageUrl?: string
  description?: string
  action?: ReactNode
}

export const ContentCardTemplate = ({
  category,
  categoryTone,
  seen,
  title,
  imageUrl,
  description,
  action,
  timestamp,
  layout = 'default',
  onMarkAsRead,
  onRemove,
}: ContentCardTemplateProps) => (
  <NotificationWrapper>
    <NotificationHeader
      category={category}
      categoryTone={categoryTone}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      timestamp={timestamp}
    />
    <NotificationBody
      action={action}
      main={
        <div className="space-y-1">
          <h3
            className={`line-clamp-2 font-medium text-[#2d2f36] ${
              layout === 'compact'
                ? 'text-[1rem] leading-[1.35]'
                : 'text-[1.15rem] leading-[1.35]'
            }`}
          >
            {title}
          </h3>
          {description ? (
            <p className="text-[#5f6172] text-sm leading-snug">{description}</p>
          ) : null}
        </div>
      }
      media={imageUrl ? <MediaThumb alt={title} src={imageUrl} /> : undefined}
    />
  </NotificationWrapper>
)

type MessageCardTemplateProps = TemplateCommonProps & {
  title: string
  description?: string
  action?: ReactNode
}

export const MessageCardTemplate = ({
  category,
  categoryTone,
  seen,
  title,
  description,
  action,
  timestamp,
  layout = 'default',
  onMarkAsRead,
  onRemove,
}: MessageCardTemplateProps) => (
  <NotificationWrapper>
    <NotificationHeader
      category={category}
      categoryTone={categoryTone}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      timestamp={timestamp}
    />
    <NotificationBody
      action={action}
      main={
        <div className="space-y-1">
          <h3
            className={`font-medium text-[#2d2f36] ${
              layout === 'compact'
                ? 'text-[1rem] leading-[1.35]'
                : 'text-[1.15rem] leading-[1.35]'
            }`}
          >
            {title}
          </h3>
          {description ? (
            <p className="text-[#5f6172] text-sm leading-snug">{description}</p>
          ) : null}
        </div>
      }
    />
  </NotificationWrapper>
)
