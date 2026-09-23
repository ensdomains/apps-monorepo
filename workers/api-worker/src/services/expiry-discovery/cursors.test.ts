import { describe, expect, it } from 'vitest'
import { KV_KEY } from '#core/kv/index.js'
import {
  loadNotificationCursors,
  type NotificationCursors,
  storeNotificationCursors,
} from './cursors.js'
import { getDefaultCursorForStage, STAGES } from './stages.js'

class MockKV {
  private store = new Map<string, string>()
  async get(key: string, type?: 'json') {
    const raw = this.store.get(key)
    if (!raw) return null
    return type === 'json' ? JSON.parse(raw) : raw
  }
  async put(key: string, value: string) {
    this.store.set(key, value)
  }
  seed(key: string, value: unknown) {
    this.store.set(key, JSON.stringify(value))
  }
  readRaw(key: string) {
    return this.store.get(key)
  }
}

const defaultsAt = (now: number): NotificationCursors =>
  Object.fromEntries(
    STAGES.map((stage) => [
      stage.id,
      { expiry_timestamp: getDefaultCursorForStage(stage, now) },
    ]),
  ) as NotificationCursors

describe('notification cursors', () => {
  it('uses lifecycle-safe defaults when KV is missing', async () => {
    const now = 1_700_000_000
    const result = await loadNotificationCursors(
      { KV: new MockKV() } as unknown as CloudflareBindings,
      now,
    )
    expect(result._unsafeUnwrap()).toEqual(defaultsAt(now))
  })

  it('fills missing lifecycle keys without reading legacy keys', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      'expiry-30d': { expiry_timestamp: 10 },
      '30d': { expiry_timestamp: 999 },
    })
    const result = await loadNotificationCursors(
      { KV: kv } as unknown as CloudflareBindings,
      100,
    )
    expect(result._unsafeUnwrap()).toEqual({
      ...defaultsAt(100),
      'expiry-30d': { expiry_timestamp: 10 },
    })
  })

  it('rejects invalid cursor values', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      'expiry-30d': { expiry_timestamp: 'oops' },
    })
    const result = await loadNotificationCursors(
      { KV: kv } as unknown as CloudflareBindings,
      100,
    )
    expect(result._unsafeUnwrapErr()._tag).toBe('CURSOR_PARSE_ERROR')
  })

  it('stores the lifecycle cursor set', async () => {
    const kv = new MockKV()
    const cursors = defaultsAt(100)
    await storeNotificationCursors(
      { KV: kv } as unknown as CloudflareBindings,
      cursors,
    )
    const stored = kv.readRaw(KV_KEY.EXPIRY_DISCOVERY.CURSORS)
    if (!stored) throw new Error('Expected stored cursor value')
    expect(JSON.parse(stored)).toEqual(cursors)
  })
})
