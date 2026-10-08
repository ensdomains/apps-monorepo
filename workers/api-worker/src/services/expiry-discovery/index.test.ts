import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./page.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page.js')>()),
  fetchSweep: vi.fn(),
}))
vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchIndexedAtSec: vi.fn(),
  fetchIndexReadiness: vi.fn(),
}))

import { KV_KEY } from '#core/kv/index.js'
import { runExpiryDiscoveryCron } from './index.js'
import {
  type ExpiringName,
  fetchIndexedAtSec,
  fetchIndexReadiness,
  IndexerRequestError,
} from './indexer.js'
import {
  fetchSweep,
  type ProcessableExpiryPage,
  type StageWindow,
} from './page.js'
import {
  getLowerBoundForStage,
  getUpperBoundForStage,
  STAGES,
} from './stages.js'

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
}

type CursorState = Record<string, { expiry_timestamp: number }>
const NOW = Math.floor(new Date('2026-02-11T12:00:00Z').getTime() / 1000)
const stage = (id: (typeof STAGES)[number]['id']) => {
  const value = STAGES.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing stage: ${id}`)
  return value
}
const caughtUpCursors = (): CursorState =>
  Object.fromEntries(
    STAGES.map((value) => [
      value.id,
      { expiry_timestamp: getUpperBoundForStage(value, NOW) },
    ]),
  )
const makeEnv = (
  kv: MockKV,
  sendBatch = vi.fn(async (_messages: Array<{ body: unknown }>) => undefined),
) =>
  ({
    KV: kv,
    EVENT_INGESTION_QUEUE: { sendBatch },
  }) as unknown as CloudflareBindings

const stageName = (
  name: string,
  expiryDate: number,
  extra: Partial<ExpiringName> = {},
): ExpiringName => ({
  name,
  expiryDate,
  registrationStatus: 'registered',
  hasV2Grace: true,
  ...extra,
})

// A complete read ends at the window's end, as the sweep does.
const readOf = (
  domains: readonly ExpiringName[],
  window: StageWindow,
): ProcessableExpiryPage => ({
  domains,
  cursorEnd: window.upperBound,
  hasMore: false,
})

const sweepWith = (
  pageFor: (window: StageWindow) => ProcessableExpiryPage,
  indexedAtSec = NOW,
) =>
  vi.mocked(fetchSweep).mockImplementation(({ windows }) =>
    okAsync({
      pages: new Map(
        windows.map((window) => [window.stage.id, pageFor(window)]),
      ),
      indexedAtSec,
    }),
  )

const sweptWindows = (): readonly StageWindow[] =>
  vi.mocked(fetchSweep).mock.calls[0]?.[0].windows ?? []

const readCursors = async (kv: MockKV) =>
  (await kv.get(KV_KEY.EXPIRY_DISCOVERY.CURSORS, 'json')) as CursorState

const failure = () =>
  new IndexerRequestError({
    message: 'unavailable',
    cause: new Error('bigname unavailable'),
    attempt: 3,
  })

describe('runExpiryDiscoveryCron', () => {
  beforeEach(() => {
    vi.mocked(fetchSweep).mockReset()
    vi.mocked(fetchIndexedAtSec).mockReset()
    vi.mocked(fetchIndexedAtSec).mockReturnValue(okAsync(NOW))
    vi.mocked(fetchIndexReadiness).mockReset()
    vi.mocked(fetchIndexReadiness).mockReturnValue(okAsync({ isReady: true }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW * 1000))
  })

  it('emits a staged lifecycle event from the clamped window', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW - 100 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )
    sweepWith((window) =>
      readOf(
        [stageName('alpha.eth', window.cursor + 100, { owner: '0xabc' })],
        window,
      ),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result.isOk()).toBe(true)
    const lowerBound = getLowerBoundForStage(stage('expiry-30d'), NOW)
    expect(sweptWindows()).toEqual([
      expect.objectContaining({ cursor: lowerBound }),
    ])
    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          type: 'name_expiring',
          name: 'alpha.eth',
          expiryDate: lowerBound + 100,
          stage: 'expiry-30d',
          owner: '0xabc',
          includeFavorites: false,
        },
      },
    ])
  })

  it('reads every open stage in one sweep', async () => {
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        STAGES.map((value) => [
          value.id,
          { expiry_timestamp: getLowerBoundForStage(value, NOW) },
        ]),
      ),
    )
    sweepWith((window) => readOf([], window))

    await runExpiryDiscoveryCron(makeEnv(kv))

    expect(fetchSweep).toHaveBeenCalledTimes(1)
    expect(sweptWindows().map(({ stage: value }) => value.id)).toEqual(
      STAGES.map(({ id }) => id),
    )
  })

  it('moves open windows to their end, from the lower bound when a cursor is stale', async () => {
    sweepWith((window) => readOf([], window))
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW - 100 * 86_400 }
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    await runExpiryDiscoveryCron(makeEnv(kv))

    const stored = await readCursors(kv)
    expect(sweptWindows()).toEqual([
      expect.objectContaining({
        cursor: getLowerBoundForStage(stage('expiry-30d'), NOW),
      }),
      expect.objectContaining({ cursor: NOW + 2 * 86_400 }),
    ])
    expect(stored['expiry-30d']?.expiry_timestamp).toBe(
      getUpperBoundForStage(stage('expiry-30d'), NOW),
    )
    expect(stored['expiry-7d']?.expiry_timestamp).toBe(
      getUpperBoundForStage(stage('expiry-7d'), NOW),
    )
  })

  it('caps every window at the time the index has reached', async () => {
    const indexedAt = NOW - 2 * 3600
    vi.mocked(fetchIndexedAtSec).mockReturnValue(okAsync(indexedAt))
    sweepWith((window) => readOf([], window))
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        STAGES.map((value) => [
          value.id,
          { expiry_timestamp: getLowerBoundForStage(value, indexedAt) },
        ]),
      ),
    )

    await runExpiryDiscoveryCron(makeEnv(kv))

    for (const swept of sweptWindows()) {
      expect(swept.upperBound).toBe(
        getUpperBoundForStage(swept.stage, indexedAt),
      )
    }
  })

  it('sends nothing and holds every cursor when the sweep read an older index than it planned on', async () => {
    const olderRead = NOW - 3600
    sweepWith(
      (window) => readOf([stageName('renewed.eth', window.upperBound)], window),
      olderRead,
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )
    const kv = new MockKV()
    const cursors = Object.fromEntries(
      STAGES.map((value) => [
        value.id,
        { expiry_timestamp: getLowerBoundForStage(value, NOW) },
      ]),
    )
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result._unsafeUnwrap()).toEqual({
      totalEnqueued: 0,
      failedStages: 0,
    })
    expect(sendBatch).not.toHaveBeenCalled()
    expect(await readCursors(kv)).toEqual(cursors)
  })

  it('accepts a sweep from a newer index than it planned on', async () => {
    sweepWith(
      (window) =>
        readOf(
          window.stage.id === 'expiry-30d'
            ? [stageName('alice.eth', window.upperBound)]
            : [],
          window,
        ),
      NOW + 60,
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        STAGES.map((value) => [
          value.id,
          { expiry_timestamp: getLowerBoundForStage(value, NOW) },
        ]),
      ),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result._unsafeUnwrap().totalEnqueued).toBe(1)
  })

  it.each([
    {
      case: 'is not current',
      readiness: () =>
        okAsync({ isReady: false as const, reason: 'lag unknown' }),
      failedStages: 0,
    },
    {
      case: 'status cannot be read',
      readiness: () => errAsync(failure()),
      failedStages: STAGES.length,
    },
  ])('sends nothing and holds every cursor when the index $case', async ({
    readiness,
    failedStages,
  }) => {
    vi.mocked(fetchIndexReadiness).mockReturnValue(readiness())
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result._unsafeUnwrap()).toEqual({ totalEnqueued: 0, failedStages })
    expect(fetchSweep).not.toHaveBeenCalled()
    expect(await readCursors(kv)).toEqual(cursors)
  })

  it('holds every cursor when the index position cannot be read', async () => {
    vi.mocked(fetchIndexedAtSec).mockReturnValue(errAsync(failure()))
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result._unsafeUnwrap()).toEqual({
      totalEnqueued: 0,
      failedStages: STAGES.length,
    })
    expect(fetchSweep).not.toHaveBeenCalled()
    expect(await readCursors(kv)).toEqual(cursors)
  })

  it('holds every open cursor when the sweep fails, and leaves caught-up stages alone', async () => {
    vi.mocked(fetchSweep).mockReturnValue(errAsync(failure()))
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    cursors['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result._unsafeUnwrap().failedStages).toBe(2)
    expect(await readCursors(kv)).toEqual(cursors)
  })

  it('emits only the current lifecycle stage after a long catch-up gap', async () => {
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        STAGES.map((value) => [
          value.id,
          { expiry_timestamp: NOW - 100 * 86_400 },
        ]),
      ),
    )
    const targetExpiry = NOW - 10 * 86_400
    sweepWith((window) =>
      readOf(
        targetExpiry > window.cursor && targetExpiry <= window.upperBound
          ? [stageName('catch-up.eth', targetExpiry)]
          : [],
        window,
      ),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    const events = sendBatch.mock.calls.flatMap(([messages]) =>
      messages.map(({ body }) => body),
    ) as Array<{ stage: string }>
    expect(events).toEqual([expect.objectContaining({ stage: 'grace-start' })])
  })

  it('does not advance a stage cursor when queue publication fails', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    cursors['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    sweepWith((window) =>
      readOf([stageName('alpha.eth', window.cursor + 50)], window),
    )
    const sendBatch = vi.fn(async (messages: Array<{ body: unknown }>) => {
      const event = messages[0]?.body as { stage?: string } | undefined
      if (event?.stage === 'expiry-7d') throw new Error('queue unavailable')
      return undefined
    })

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))
    const stored = await readCursors(kv)

    expect(result._unsafeUnwrap()).toEqual({
      totalEnqueued: 1,
      failedStages: 1,
    })
    expect(sendBatch).toHaveBeenCalledTimes(2)
    expect(stored['expiry-7d']).toEqual(cursors['expiry-7d'])
    expect(stored['expiry-1d']?.expiry_timestamp).toBe(
      getUpperBoundForStage(stage('expiry-1d'), NOW),
    )
  })

  it('keeps Cloudflare event queue batches at 100 messages', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW + 10 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    sweepWith((window) =>
      readOf(
        Array.from({ length: 150 }, (_, index) =>
          stageName(`${index}.eth`, window.cursor + index + 1),
        ),
        window,
      ),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result._unsafeUnwrap().totalEnqueued).toBe(150)
    expect(sendBatch.mock.calls.map(([messages]) => messages.length)).toEqual([
      100, 50,
    ])
  })

  it('stores the cursor the sweep stopped at when more is left', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW + 10 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const cursor = cursors['expiry-30d'].expiry_timestamp
    sweepWith(() => ({
      domains: [stageName('a.eth', cursor + 1), stageName('b.eth', cursor + 2)],
      cursorEnd: cursor + 5,
      hasMore: true,
    }))

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result._unsafeUnwrap().totalEnqueued).toBe(2)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      cursor + 5,
    )
  })
})
