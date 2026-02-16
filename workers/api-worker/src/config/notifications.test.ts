import { describe, expect, it } from 'vitest'
import {
  type NotificationCatalogKind,
  notificationCatalog,
  notificationDefinitions,
} from '#config/notifications.js'

describe('notification catalog contract', () => {
  it('exposes all required fields for every notification kind', () => {
    for (const [kind, definition] of Object.entries(notificationDefinitions)) {
      expect(definition.kind).toBe(kind)
      expect(definition.payloadSchema).toBeDefined()
      expect(definition.metadata).toBeDefined()
      expect(definition.delivery).toBeDefined()
      expect(definition.source).toMatch(/^(personal|broadcast)$/)
    }
  })

  it('exports runtime-safe catalog without payload schemas', () => {
    for (const kind of Object.keys(
      notificationCatalog,
    ) as NotificationCatalogKind[]) {
      const catalogItem = notificationCatalog[kind]
      expect(catalogItem.kind).toBe(kind)
      expect(catalogItem.metadata.label.length).toBeGreaterThan(0)
      expect('payloadSchema' in (catalogItem as object)).toBe(false)
      expect('ui' in (catalogItem as object)).toBe(false)
    }
  })
})
