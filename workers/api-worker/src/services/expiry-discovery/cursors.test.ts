import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import { KV_KEY } from '#core/kv/index.js'
import {
  loadNotificationCursors,
  type NotificationCursors,
  storeNotificationCursors,
} from './cursors.js'
import { getDefaultCursorForStage, STAGES } from './stages.js'
import { requireStoredValue } from './test-helpers.js'

const DAY = 86_400

class MockKV {
  private store = new Map<string, string>()

  async get(key: string, type?: 'json') {
    const raw = this.store.get(key)
    if (!raw) return null
    if (type === 'json') return JSON.parse(raw)
    return raw
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

const defaultCursorsAt = (nowSec: number): NotificationCursors =>
  Object.fromEntries(
    STAGES.map((stage) => [
      stage.id,
      { expiry_timestamp: getDefaultCursorForStage(stage, nowSec) },
    ]),
  ) as NotificationCursors

describe('notification cursors', () => {
  it('initializes defaults when KV value is missing', async () => {
    const env = { KV: new MockKV() } as unknown as CloudflareBindings
    const nowSec = 1_700_000_000
    const result = await loadNotificationCursors(env, nowSec)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual(defaultCursorsAt(nowSec))
    expect(result._unsafeUnwrap()['grace-7d'].expiry_timestamp).toBe(
      nowSec - (V2_GRACE_PERIOD_DAYS - 7) * DAY,
    )
  })

  it('fills missing stages from defaults when KV value is partial', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      'expiry-30d': { expiry_timestamp: 10 },
      'grace-start': { expiry_timestamp: 5 },
    })

    const env = { KV: kv } as unknown as CloudflareBindings
    const nowSec = 20
    const result = await loadNotificationCursors(env, nowSec)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      ...defaultCursorsAt(nowSec),
      'expiry-30d': { expiry_timestamp: 10 },
      'grace-start': { expiry_timestamp: 5 },
    })
  })

  it('migrates legacy stage cursor keys', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      '30d': { expiry_timestamp: 10 },
      '7d': { expiry_timestamp: 20 },
      '1d': { expiry_timestamp: 30 },
      expired: { expiry_timestamp: 40 },
    })

    const env = { KV: kv } as unknown as CloudflareBindings
    const nowSec = 100
    const result = await loadNotificationCursors(env, nowSec)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toMatchObject({
      'expiry-30d': { expiry_timestamp: 10 },
      'expiry-7d': { expiry_timestamp: 20 },
      'expiry-1d': { expiry_timestamp: 30 },
      'grace-start': { expiry_timestamp: 40 },
    })
  })

  it('returns CURSOR_PARSE_ERROR when KV value is invalid', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      'expiry-30d': { expiry_timestamp: 'oops' },
    })

    const env = { KV: kv } as unknown as CloudflareBindings
    const result = await loadNotificationCursors(env, 10)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('CURSOR_PARSE_ERROR')
  })

  it('stores all stage cursors in one KV key', async () => {
    const kv = new MockKV()
    const env = { KV: kv } as unknown as CloudflareBindings
    const cursors = defaultCursorsAt(50)

    const writeResult = await storeNotificationCursors(env, cursors)

    expect(writeResult.isOk()).toBe(true)

    const stored = requireStoredValue(
      kv.readRaw(KV_KEY.EXPIRY_DISCOVERY.CURSORS),
    )
    expect(JSON.parse(stored)).toEqual(cursors)
  })
})
