import type { BackendNotification } from '../queries/notifications'
import { alphaWelcomeKind } from './alpha-welcome'
import { blogPostKind } from './blog-post'
import { ensUpdateKind } from './ens-update'
import { nameExpiryKind } from './name-expiry'
import { nameTransferredKind } from './name-transferred'
import type { KindDefinition, NotificationKind } from './types'

/**
 * Single source of truth for manager-side notification kind behavior.
 */
export const notificationKindRegistry = {
  'name-expiry': nameExpiryKind,
  'name-transferred': nameTransferredKind,
  'blog-post': blogPostKind,
  'alpha-welcome': alphaWelcomeKind,
  'ens-update': ensUpdateKind,
} as const satisfies { [K in BackendNotification['kind']]: KindDefinition<K> }

type RuntimeNotification =
  | BackendNotification
  | {
      id: string
      kind: string
      payload: unknown
      source: BackendNotification['source']
      seen: boolean
      timestamp: number
    }

type AnyKindDefinition = {
  [K in NotificationKind]: KindDefinition<K>
}[NotificationKind]

export type RenderableNotification = {
  type: 'renderable'
  definition: AnyKindDefinition
  notification: BackendNotification
}

export type InvalidNotification = {
  type: 'invalid'
  id: string
  kind: string
}

export type UnknownKindNotification = {
  type: 'unknown-kind'
  id: string
  kind: string
}

export type NotificationResolveResult =
  | RenderableNotification
  | InvalidNotification
  | UnknownKindNotification

const runtimeRegistry: Record<string, AnyKindDefinition> =
  notificationKindRegistry

/**
 * Resolve one notification into a renderable kind definition.
 * Invalid payloads and unknown kinds are rejected for UI safety.
 */
export const resolveRenderableNotification = (
  notification: RuntimeNotification,
): NotificationResolveResult => {
  const definition = runtimeRegistry[notification.kind]

  if (!definition) {
    return {
      type: 'unknown-kind',
      id: notification.id,
      kind: notification.kind,
    }
  }

  if (!definition.isValidPayload(notification.payload)) {
    return {
      type: 'invalid',
      id: notification.id,
      kind: notification.kind,
    }
  }

  return {
    type: 'renderable',
    definition,
    notification: notification as BackendNotification,
  }
}
