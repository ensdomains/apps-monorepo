import { NOTIFICATION_CATALOG } from 'api-worker/types'

/**
 * Semantic backend-owned notification catalog.
 *
 * Frontend templates and rendering stay in manager-side kind modules.
 */
export const notificationCatalog = NOTIFICATION_CATALOG

export type NotificationCatalog = typeof notificationCatalog
export type NotificationCatalogKind = keyof NotificationCatalog

export const getCatalogItem = (kind: string) =>
  notificationCatalog[kind as NotificationCatalogKind]
