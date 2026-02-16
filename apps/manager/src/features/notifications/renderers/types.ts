import type { BackendNotification } from '../queries/notifications'

export type BaseItemProps = {
  timestamp: number
  onAction?: () => void
  onMarkAsRead?: () => void
  onRemove?: () => void
}

export type Kind = BackendNotification['kind']

export type NotificationPayloadForKind<K extends Kind> = Extract<
  BackendNotification,
  { kind: K }
>['payload']

export type KindRendererProps<K extends Kind> = BaseItemProps & {
  payload: NotificationPayloadForKind<K>
  notification: Extract<BackendNotification, { kind: K }>
}

export type NotificationRendererProps = BaseItemProps & {
  payload: BackendNotification['payload']
  notification: BackendNotification
}

export type NotificationRenderer = React.FC<NotificationRendererProps>
