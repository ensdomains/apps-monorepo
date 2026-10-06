import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./page.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page.js')>()),
  fetchStageNames: vi.fn(),
}))

import { KV_KEY } from '#core/kv/index.js'
import { runExpiryDiscoveryCron } from './index.js'
import { IndexerRequestError } from './indexer.js'
import { fetchStageNames, type StageName } from './page.js'
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
  position: number,
  extra: Partial<StageName> = {},
): StageName => ({
  name,
  expiryDate: position,
  protocol: 'v2',
  position,
  ...extra,
})

const readOf = (
  domains: readonly StageName[],
  cursor: number,
  indexedAtSec = NOW,
) => ({
  domains,
  cursorEnd: domains.at(-1)?.position ?? cursor,
  hasMore: false,
  indexedAtSec,
})

describe('runExpiryDiscoveryCron', () => {
  beforeEach(() => {
    vi.mocked(fetchStageNames).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW * 1000))
  })

  it('emits a staged lifecycle event, with its protocol, from the clamped window', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW - 100 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )
    vi.mocked(fetchStageNames).mockImplementation(({ cursor }) =>
      okAsync(
        readOf(
          [
            stageName('alpha.eth', cursor + 100, {
              protocol: 'v1',
              owner: '0xabc',
            }),
          ],
          cursor,
        ),
      ),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result.isOk()).toBe(true)
    const lowerBound = getLowerBoundForStage(stage('expiry-30d'), NOW)
    expect(fetchStageNames).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: lowerBound }),
    )
    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          type: 'name_expiring',
          name: 'alpha.eth',
          expiryDate: lowerBound + 100,
          protocol: 'v1',
          stage: 'expiry-30d',
          owner: '0xabc',
          includeFavorites: false,
        },
      },
    ])
  })

  it('snaps an empty stale stage to its lower bound but leaves an in-window cursor unchanged', async () => {
    vi.mocked(fetchStageNames).mockImplementation(({ cursor }) =>
      okAsync(readOf([], cursor)),
    )
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW - 100 * 86_400 }
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    await runExpiryDiscoveryCron(makeEnv(kv))

    const stored = (await kv.get(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      'json',
    )) as CursorState
    expect(stored['expiry-30d']?.expiry_timestamp).toBe(
      getLowerBoundForStage(stage('expiry-30d'), NOW),
    )
    expect(stored['expiry-7d']?.expiry_timestamp).toBe(NOW + 2 * 86_400)
  })

  it('holds a stage cursor when the indexer is behind, even on an empty window', async () => {
    vi.mocked(fetchStageNames).mockImplementation(({ cursor }) =>
      okAsync(readOf([], cursor, NOW - 2 * 3600)),
    )
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW - 100 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    await runExpiryDiscoveryCron(makeEnv(kv))

    const stored = (await kv.get(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      'json',
    )) as CursorState
    expect(stored['expiry-30d']?.expiry_timestamp).toBe(NOW - 100 * 86_400)
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
    vi.mocked(fetchStageNames).mockImplementation(({ cursor, upperBound }) =>
      okAsync(
        readOf(
          targetExpiry > cursor && targetExpiry <= upperBound
            ? [stageName('catch-up.eth', targetExpiry)]
            : [],
          cursor,
        ),
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

  it('commits successful stages while preserving a failed stage cursor', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    cursors['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchStageNames).mockImplementation(
      ({ stage: current, cursor }) =>
        current.id === 'expiry-7d'
          ? errAsync(
              new IndexerRequestError({ message: 'unavailable', attempt: 3 }),
            )
          : okAsync(readOf([stageName('beta.eth', cursor + 50)], cursor)),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv))
    const stored = (await kv.get(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      'json',
    )) as CursorState
    expect(result._unsafeUnwrap().failedStages).toBe(1)
    expect(stored['expiry-7d']).toEqual(cursors['expiry-7d'])
    expect(stored['expiry-1d']?.expiry_timestamp).toBe(NOW + 50)
  })

  it('does not advance a stage cursor when queue publication fails', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-7d'] = { expiry_timestamp: NOW + 2 * 86_400 }
    cursors['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchStageNames).mockImplementation(({ cursor }) =>
      okAsync(readOf([stageName('alpha.eth', cursor + 50)], cursor)),
    )
    const sendBatch = vi.fn(async (messages: Array<{ body: unknown }>) => {
      const event = messages[0]?.body as { stage?: string } | undefined
      if (event?.stage === 'expiry-7d') throw new Error('queue unavailable')
      return undefined
    })

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))
    const stored = (await kv.get(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      'json',
    )) as CursorState

    expect(result._unsafeUnwrap()).toEqual({
      totalEnqueued: 1,
      failedStages: 1,
    })
    expect(sendBatch).toHaveBeenCalledTimes(2)
    expect(stored['expiry-7d']).toEqual(cursors['expiry-7d'])
    expect(stored['expiry-1d']?.expiry_timestamp).toBe(NOW + 50)
  })

  it('keeps Cloudflare event queue batches at 100 messages', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW + 10 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchStageNames).mockImplementation(({ cursor }) =>
      okAsync(
        readOf(
          Array.from({ length: 150 }, (_, index) =>
            stageName(`${index}.eth`, cursor + index + 1),
          ),
          cursor,
        ),
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

  it('stores the cursor the stage read stopped at when more is left', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors['expiry-30d'] = { expiry_timestamp: NOW + 10 * 86_400 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const cursor = cursors['expiry-30d'].expiry_timestamp
    vi.mocked(fetchStageNames).mockReturnValue(
      okAsync({
        domains: [
          stageName('a.eth', cursor + 1),
          stageName('b.eth', cursor + 2),
        ],
        cursorEnd: cursor + 5,
        hasMore: true,
        indexedAtSec: NOW,
      }),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv))
    const stored = (await kv.get(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      'json',
    )) as CursorState
    expect(result._unsafeUnwrap().totalEnqueued).toBe(2)
    expect(stored['expiry-30d']?.expiry_timestamp).toBe(cursor + 5)
  })
})
