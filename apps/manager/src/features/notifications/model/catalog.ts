import { NOTIFICATION_CATALOG } from 'api-worker/types'

export const notificationCatalog = NOTIFICATION_CATALOG

export type NotificationCatalog = typeof notificationCatalog
export type NotificationCatalogKind = keyof NotificationCatalog

export const getCatalogItem = (kind: string) =>
  notificationCatalog[kind as NotificationCatalogKind]

export const getTemplateForKind = (kind: string) =>
  getCatalogItem(kind)?.ui.template
