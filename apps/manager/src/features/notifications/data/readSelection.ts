import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import type { NotificationTag } from '@/features/ai/managerActions'
import type { BackendNotification } from './queries/notifications'

/** The reviewed count and submitted IDs must refer to the same loaded subset. */
export const selectUnreadNotifications = <
  T extends Pick<BackendNotification, 'kind' | 'seen'>,
>(
  loaded: readonly T[],
  tag: NotificationTag = 'all',
): T[] =>
  loaded.filter(
    ({ kind, seen }) =>
      !seen &&
      (tag === 'all' ||
        notificationDefinitions[kind]?.metadata.tags.some(
          (value) => value === tag,
        )),
  )
