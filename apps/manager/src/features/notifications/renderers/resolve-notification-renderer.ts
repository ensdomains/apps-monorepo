import { getTemplateForKind } from '@/features/notifications/model/catalog'
import { kindOverrides } from './kind-overrides'
import {
  templateRenderers,
  UnknownNotificationRenderer,
} from './template-renderers'
import type { NotificationRenderer } from './types'

export const resolveNotificationRenderer = (
  kind: string,
): NotificationRenderer => {
  const override = kindOverrides[kind as keyof typeof kindOverrides]
  if (override) {
    return override as unknown as NotificationRenderer
  }

  const template = getTemplateForKind(kind)
  if (!template) {
    return UnknownNotificationRenderer
  }

  return templateRenderers[template] ?? UnknownNotificationRenderer
}
