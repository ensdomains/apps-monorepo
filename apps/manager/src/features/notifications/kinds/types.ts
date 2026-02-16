import type { FC } from 'react'
import type { BackendNotification } from '../queries/notifications'

export type NotificationKind = BackendNotification['kind']

export type NotificationForKind<K extends NotificationKind> = Extract<
  BackendNotification,
  { kind: K }
>

export type NotificationPayloadForKind<K extends NotificationKind> =
  NotificationForKind<K>['payload']

export type KindComponentProps<K extends NotificationKind> = {
  notification: NotificationForKind<K>
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

/**
 * Manager-owned kind contract.
 *
 * Each kind module owns payload validation and the final React component.
 * Invalid payloads are filtered out before rendering.
 */
export type KindDefinition<K extends NotificationKind> = {
  kind: K
  isValidPayload: (payload: unknown) => payload is NotificationPayloadForKind<K>
  Component: FC<KindComponentProps<K>>
}
