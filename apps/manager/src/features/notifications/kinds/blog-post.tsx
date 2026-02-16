import { ContentCardTemplate } from '@/features/notifications/renderers/templates'
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
  onAction,
  onMarkAsRead,
  onRemove,
}: KindComponentProps<'blog-post'>) => (
  <ContentCardTemplate
    action={
      <a
        className="text-blue-600 text-sm underline hover:text-blue-800"
        href={notification.payload.url}
        onClick={onAction}
        rel="noopener noreferrer"
        target="_blank"
      >
        Go to post
      </a>
    }
    imageUrl={notification.payload.imageUrl}
    onMarkAsRead={onMarkAsRead}
    onRemove={onRemove}
    timestamp={notification.timestamp}
    title={notification.payload.title}
  />
)

export const blogPostKind: KindDefinition<'blog-post'> = {
  kind: 'blog-post',
  isValidPayload: isBlogPostPayload,
  Component: BlogPostComponent,
}
