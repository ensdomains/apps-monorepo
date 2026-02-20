import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { ContentCardTemplate } from '@/features/notifications/shared/templates'
import type {
  KindComponentProps,
  KindDefinition,
  NotificationPayloadForKind,
} from './contracts'

const isBlogPostPayload = (
  payload: unknown,
): payload is NotificationPayloadForKind<'blog-post'> => {
  return v.safeParse(
    notificationDefinitions['blog-post'].payloadSchema,
    payload,
  ).success
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
