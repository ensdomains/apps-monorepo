import { describe, expect, it } from 'vitest'
import { KV_KEY } from '#core/kv/index.js'
import {
  loadNotificationCursors,
  type NotificationCursors,
  storeNotificationCursors,
} from './cursors.js'
import { getDefaultCursorForStage, TRACKS } from './stages.js'

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
    TRACKS.map((track) => [
      track.id,
      Object.fromEntries(
        track.stages.map((stage) => [
          stage.id,
          { expiry_timestamp: getDefaultCursorForStage(stage, track, now) },
        ]),
      ),
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

  it('fills missing track and stage keys from the defaults', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      ens_v1_reserved: { 'grace-1d': { expiry_timestamp: 10 } },
    })
    const result = await loadNotificationCursors(
      { KV: kv } as unknown as CloudflareBindings,
      100,
    )
    const defaults = defaultsAt(100)
    expect(result._unsafeUnwrap()).toEqual({
      ...defaults,
      ens_v1_reserved: {
        ...defaults.ens_v1_reserved,
        'grace-1d': { expiry_timestamp: 10 },
      },
    })
  })

  it('carries pre-track cursors over to the tracks windowed on the served expiry', async () => {
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      'expiry-30d': { expiry_timestamp: 10 },
      // Keys from before the lifecycle stages are not read.
      '30d': { expiry_timestamp: 999 },
    })
    const result = await loadNotificationCursors(
      { KV: kv } as unknown as CloudflareBindings,
      100,
    )
    const defaults = defaultsAt(100)
    expect(result._unsafeUnwrap()).toEqual({
      ens_v2: { ...defaults.ens_v2, 'expiry-30d': { expiry_timestamp: 10 } },
      ens_v1_reserved: defaults.ens_v1_reserved,
      subname: defaults.subname,
    })
  })

  it('starts the subname track from its defaults when an older value has none', async () => {
    const kv = new MockKV()
    const stored = defaultsAt(50)
    const { subname: _subname, ...beforeSubnames } = stored
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, beforeSubnames)
    const result = (
      await loadNotificationCursors(
        { KV: kv } as unknown as CloudflareBindings,
        100,
      )
    )._unsafeUnwrap()

    expect(result).toEqual({
      ...beforeSubnames,
      subname: defaultsAt(100).subname,
    })
    expect(Object.keys(result.subname)).toEqual([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
      'expired',
    ])
    expect(result.ens_v2).not.toHaveProperty('expired')
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
