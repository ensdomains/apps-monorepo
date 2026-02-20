import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  type NotificationCatalogKind,
  notificationCatalog,
  notificationDefinitions,
  TelegramAuthSchema,
} from '../index'

describe('notifications catalog', () => {
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
    }
  })
})

describe('telegram auth schema', () => {
  it('parses valid auth payload', () => {
    const parsed = v.safeParse(TelegramAuthSchema, {
      id: 1,
      username: 'ens_user',
      auth_date: 1_700_000_000,
      hash: 'abc123',
    })

    expect(parsed.success).toBe(true)
  })
})
