import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { ContentCardTemplate } from '@/features/notifications/shared/templates'
import type { KindComponentProps } from './contracts'

export const BlogPostComponent = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'blog-post'>) => (
  <ContentCardTemplate
    action={
      <a
        className={getNotificationActionButtonClass(layout)}
        href={payload.url}
        onClick={onAction}
        rel="noopener noreferrer"
        target="_blank"
      >
        Go to post
      </a>
    }
    category="ENS Update"
    categoryTone="update"
    imageUrl={payload.imageUrl}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={seen}
    timestamp={timestamp}
    title={payload.title}
  />
)
