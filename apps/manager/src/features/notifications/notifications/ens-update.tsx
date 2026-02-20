import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { MessageCardTemplate } from '@/features/notifications/shared/templates'
import type { KindComponentProps } from './contracts'

export const EnsUpdateComponent = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'ens-update'>) => (
  <MessageCardTemplate
    action={
      payload.url ? (
        <a
          className={getNotificationActionButtonClass(layout)}
          href={payload.url}
          onClick={onAction}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read more
        </a>
      ) : null
    }
    category="ENS Update"
    categoryTone="update"
    description={payload.summary}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={seen}
    timestamp={timestamp}
    title={payload.title}
  />
)
