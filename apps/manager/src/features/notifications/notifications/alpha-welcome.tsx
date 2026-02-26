import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { MessageCardTemplate } from '@/features/notifications/shared/templates'
import type { KindComponentProps } from './contracts'

export const AlphaWelcomeComponent = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'alpha-welcome'>) => (
  <MessageCardTemplate
    action={
      payload.ctaLabel && payload.ctaUrl ? (
        <a
          className={getNotificationActionButtonClass(layout)}
          href={payload.ctaUrl}
          onClick={onAction}
          rel="noopener noreferrer"
          target="_blank"
        >
          {payload.ctaLabel}
        </a>
      ) : null
    }
    category="ENS Update"
    categoryTone="update"
    description={payload.body}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={seen}
    timestamp={timestamp}
    title={payload.title}
  />
)
