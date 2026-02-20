import { ContentCardTemplate } from '@/features/notifications/renderers/templates'
import { getNotificationActionButtonClass } from '@/features/notifications/ui/items/common'
import { isObject, isString } from './helpers'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './types'

const isBlogPostPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'blog-post'> => {
  if (!isObject(payload)) return false

  return (
    isString(payload.title) &&
    isString(payload.url) &&
    isString(payload.imageUrl)
  )
}

const BlogPostComponent = ({
  notification,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'blog-post'>) => (
  <ContentCardTemplate
    action={
      <a
        className={getNotificationActionButtonClass(layout)}
        href={notification.payload.url}
        onClick={onAction}
        rel="noopener noreferrer"
        target="_blank"
      >
        Go to post
      </a>
    }
    category="ENS Update"
    categoryTone="update"
    imageUrl={notification.payload.imageUrl}
    layout={layout}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    seen={notification.seen}
    timestamp={notification.timestamp}
    title={notification.payload.title}
  />
)

export const blogPostKind: KindDefinition<'blog-post'> = {
  kind: 'blog-post',
  isValidPayload: isBlogPostPayload,
  Component: BlogPostComponent,
}
