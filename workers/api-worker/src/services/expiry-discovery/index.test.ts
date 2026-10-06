import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
  fetchExpiringNamesPages: vi.fn(),
  fetchPublicationTime: vi.fn(),
}))

import { KV_KEY } from '#core/kv/index.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { runExpiryDiscoveryCron } from './index.js'
import {
  type ExpiringDomain,
  fetchExpiringNamesPage,
  fetchExpiringNamesPages,
  fetchPublicationTime,
  PROCESS_PAGE_SIZE,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import {
  type ExpiryTrack,
  type ExpiryTrackId,
  getLowerBoundForStage,
  getUpperBoundForStage,
  TRACKS,
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

type StageCursorState = Record<string, { expiry_timestamp: number }>
type CursorState = Record<ExpiryTrackId, StageCursorState>
const DAY = 86_400
const NOW = Math.floor(new Date('2026-02-11T12:00:00Z').getTime() / 1000)
const stage = (id: ExpiryStageId) => {
  const value = TRACKS.flatMap((current) => current.stages).find(
    (candidate) => candidate.id === id,
  )
  if (!value) throw new Error(`Missing stage: ${id}`)
  return value
}
const track = (id: ExpiryTrackId): ExpiryTrack => {
  const value = TRACKS.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing track: ${id}`)
  return value
}
const V2 = track('ens_v2')
const SUBNAME = track('subname')
const caughtUpCursors = (now = NOW): CursorState =>
  Object.fromEntries(
    TRACKS.map((value) => [
      value.id,
      Object.fromEntries(
        value.stages.map((current) => [
          current.id,
          { expiry_timestamp: getUpperBoundForStage(current, value, now) },
        ]),
      ),
    ]),
  ) as CursorState
const domain = (
  name: string,
  expiryDate: number,
  overrides: Partial<ExpiringDomain> = {},
): ExpiringDomain => ({
  name,
  expiryDate,
  inTrack: true,
  registrationStatus: 'active',
  ...overrides,
})
const readCursors = async (kv: MockKV) =>
  (await kv.get(KV_KEY.EXPIRY_DISCOVERY.CURSORS, 'json')) as CursorState
const sentEvents = (sendBatch: ReturnType<typeof vi.fn>) =>
  sendBatch.mock.calls.flatMap(([messages]) =>
    (messages as Array<{ body: unknown }>).map(({ body }) => body),
  )
const makeEnv = (
  kv: MockKV,
  sendBatch = vi.fn(async (_messages: Array<{ body: unknown }>) => undefined),
) =>
  ({
    KV: kv,
    EVENT_INGESTION_QUEUE: { sendBatch },
  }) as unknown as CloudflareBindings

describe('runExpiryDiscoveryCron', () => {
  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(fetchExpiringNamesPages).mockReset()
    // Feed existing lifecycle fixtures through the shared track read. HTTP
    // batching, cursor restarts and per-window caps have indexer coverage.
    vi.mocked(fetchExpiringNamesPages).mockImplementation(
      ({ env, track, windows }) =>
        ResultAsync.combine(
          windows.map((window) =>
            fetchExpiringNamesPage({ env, track, ...window }).map(
              (page) => [window.stage.id, page] as const,
            ),
          ),
        ).map((pages) => new Map(pages)),
    )
    vi.mocked(fetchPublicationTime).mockReset()
    vi.mocked(fetchPublicationTime).mockReturnValue(okAsync(NOW))
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW * 1000))
  })

  it('emits a staged lifecycle event from the clamped exclusive window', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-30d'] = { expiry_timestamp: NOW - 100 * DAY }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )
    vi.mocked(fetchExpiringNamesPage).mockImplementation(({ cursor }) =>
      okAsync({
        domains: [
          domain('alpha.eth', cursor + 100, {
            owner: '0xabc',
            graceEndDate: cursor + 100 + 28 * DAY,
          }),
        ],
        hasMore: false,
      }),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result.isOk()).toBe(true)
    const lowerBound = getLowerBoundForStage(stage('expiry-30d'), V2, NOW)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith(
      expect.objectContaining({ track: V2, cursor: lowerBound }),
    )
    expect(sentEvents(sendBatch)).toEqual([
      {
        type: 'name_expiring',
        name: 'alpha.eth',
        expiryDate: lowerBound + 100,
        graceEndDate: lowerBound + 100 + 28 * DAY,
        stage: 'expiry-30d',
        owner: '0xabc',
        includeFavorites: false,
      },
    ])
  })

  it('walks every stage of every track', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(
      okAsync({ domains: [], hasMore: false }),
    )
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    for (const current of TRACKS) {
      for (const value of current.stages) {
        cursors[current.id][value.id] = {
          expiry_timestamp:
            getUpperBoundForStage(value, current, NOW) - 10 * DAY,
        }
      }
    }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result._unsafeUnwrap().failedStages).toBe(0)
    const runs = vi
      .mocked(fetchExpiringNamesPage)
      .mock.calls.map(([ctx]) => `${ctx.track.id}/${ctx.stage.id}`)
    expect(new Set(runs)).toEqual(
      new Set(
        TRACKS.flatMap((current) =>
          current.stages.map((value) => `${current.id}/${value.id}`),
        ),
      ),
    )
    expect(fetchExpiringNamesPages).toHaveBeenCalledTimes(3)
    expect(runs.filter((run) => run.startsWith('subname/')).sort()).toEqual([
      'subname/expired',
      'subname/expiry-1d',
      'subname/expiry-30d',
      'subname/expiry-7d',
    ])
  })

  it('places windows at the publication time when it trails the wall clock', async () => {
    const publication = NOW - 3_600
    vi.mocked(fetchPublicationTime).mockReturnValue(okAsync(publication))
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(
      okAsync({ domains: [], hasMore: false }),
    )
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, caughtUpCursors(publication - 60))

    await runExpiryDiscoveryCron(makeEnv(kv))

    const graceStart = vi
      .mocked(fetchExpiringNamesPage)
      .mock.calls.find(
        ([ctx]) => ctx.track.id === 'ens_v2' && ctx.stage.id === 'grace-start',
      )?.[0]
    expect(graceStart?.upperBound).toBe(publication)
  })

  it('fails the run without moving cursors when the publication time is unknown', async () => {
    vi.mocked(fetchPublicationTime).mockReturnValue(
      errAsync(new Error('bigname down') as never),
    )
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    const result = await runExpiryDiscoveryCron(makeEnv(kv))

    expect(result.isErr()).toBe(true)
    expect(fetchExpiringNamesPage).not.toHaveBeenCalled()
    expect(await readCursors(kv)).toEqual(cursors)
  })

  it('snaps an empty stale stage to its lower bound but leaves an in-window cursor unchanged', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(
      okAsync({ domains: [], hasMore: false }),
    )
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-30d'] = { expiry_timestamp: NOW - 100 * DAY }
    cursors.ens_v2['expiry-7d'] = { expiry_timestamp: NOW + 2 * DAY }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)

    await runExpiryDiscoveryCron(makeEnv(kv))

    const stored = await readCursors(kv)
    expect(stored.ens_v2['expiry-30d']?.expiry_timestamp).toBe(
      getLowerBoundForStage(stage('expiry-30d'), V2, NOW),
    )
    expect(stored.ens_v2['expiry-7d']?.expiry_timestamp).toBe(NOW + 2 * DAY)
  })

  it('emits only the current lifecycle stage after a long catch-up gap', async () => {
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        TRACKS.map((value) => [
          value.id,
          Object.fromEntries(
            value.stages.map((current) => [
              current.id,
              { expiry_timestamp: NOW - 100 * DAY },
            ]),
          ),
        ]),
      ),
    )
    const targetExpiry = NOW - 10 * DAY
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, cursor, upperBound }) =>
        okAsync({
          domains:
            current.id === 'ens_v2' &&
            targetExpiry > cursor &&
            targetExpiry <= upperBound
              ? [
                  domain('catch-up.eth', targetExpiry, {
                    registrationStatus: 'released',
                    releaseKind: 'expired',
                  }),
                ]
              : [],
          hasMore: false,
        }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(sentEvents(sendBatch)).toEqual([
      expect.objectContaining({ stage: 'grace-start' }),
    ])
  })

  it('preserves every open cursor of a failed batched track', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-7d'] = { expiry_timestamp: NOW + 2 * DAY }
    cursors.ens_v2['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, stage: value, cursor }) => {
        if (current.id === 'ens_v2' && value.id === 'expiry-7d')
          return errAsync(new Error('indexer unavailable') as never)
        return okAsync({
          domains: [domain('beta.eth', cursor + 50)],
          hasMore: false,
        })
      },
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv))
    const stored = await readCursors(kv)
    expect(result._unsafeUnwrap().failedStages).toBe(2)
    expect(stored.ens_v2['expiry-7d']).toEqual(cursors.ens_v2['expiry-7d'])
    expect(stored.ens_v2['expiry-1d']).toEqual(cursors.ens_v2['expiry-1d'])
  })

  it('does not advance a stage cursor when queue publication fails', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-7d'] = { expiry_timestamp: NOW + 2 * DAY }
    cursors.ens_v2['expiry-1d'] = { expiry_timestamp: NOW }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(({ cursor }) =>
      okAsync({
        domains: [domain('alpha.eth', cursor + 50)],
        hasMore: false,
      }),
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
    expect(stored.ens_v2['expiry-7d']).toEqual(cursors.ens_v2['expiry-7d'])
    expect(stored.ens_v2['expiry-1d']?.expiry_timestamp).toBe(NOW + 50)
  })

  it('keeps Cloudflare event queue batches at 100 messages', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-30d'] = { expiry_timestamp: NOW + 10 * DAY }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(({ cursor }) =>
      okAsync({
        domains: Array.from({ length: 201 }, (_, index) =>
          domain(`${index}.eth`, cursor + index + 1),
        ),
        hasMore: false,
      }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(result._unsafeUnwrap().totalEnqueued).toBe(201)
    expect(sendBatch.mock.calls.map(([messages]) => messages.length)).toEqual([
      100, 100, 1,
    ])
  })

  it('reserves one lookahead row and advances to the safe timestamp', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v2['expiry-30d'] = { expiry_timestamp: NOW + 10 * DAY }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const cursor = cursors.ens_v2['expiry-30d'].expiry_timestamp
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, stage: value }) =>
        okAsync(
          current.id === 'ens_v2' && value.id === 'expiry-30d'
            ? {
                domains: Array.from({ length: QUERY_PAGE_SIZE }, (_, index) =>
                  domain(`${index}.eth`, cursor + index + 1),
                ),
                hasMore: true,
              }
            : { domains: [], hasMore: false },
        ),
    )

    const result = await runExpiryDiscoveryCron(makeEnv(kv))
    const stored = await readCursors(kv)
    expect(result._unsafeUnwrap().totalEnqueued).toBe(PROCESS_PAGE_SIZE)
    expect(stored.ens_v2['expiry-30d']?.expiry_timestamp).toBe(
      cursor + PROCESS_PAGE_SIZE,
    )
  })

  it('filters rows by phase and track fit per stage and still advances the cursor', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    const upperBound = getUpperBoundForStage(stage('grace-7d'), V2, NOW)
    cursors.ens_v2['grace-7d'] = { expiry_timestamp: upperBound - 100 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, stage: value }) =>
        okAsync({
          domains:
            current.id === 'ens_v2' && value.id === 'grace-7d'
              ? [
                  domain('v2-lapsed.eth', upperBound - 50, {
                    owner: '0xdef',
                    registrationStatus: 'released',
                    releaseKind: 'expired',
                  }),
                  domain('unregistered.eth', upperBound - 40, {
                    registrationStatus: 'released',
                    releaseKind: 'unregistered',
                  }),
                  domain('other-track.eth', upperBound - 10, {
                    inTrack: false,
                    owner: '0xabc',
                  }),
                ]
              : [],
          hasMore: false,
        }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(sentEvents(sendBatch)).toEqual([
      expect.objectContaining({
        name: 'v2-lapsed.eth',
        stage: 'grace-7d',
        owner: '0xdef',
      }),
    ])
    const stored = await readCursors(kv)
    expect(stored.ens_v2['grace-7d']?.expiry_timestamp).toBe(upperBound - 10)
  })

  it('tells an ENSv1 lease holder their grace ends soon, 83 days after the lease', async () => {
    const reserved = track('ens_v1_reserved')
    const upperBound = getUpperBoundForStage(stage('grace-7d'), reserved, NOW)
    expect(upperBound).toBe(NOW - 83 * DAY)
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    cursors.ens_v1_reserved['grace-7d'] = { expiry_timestamp: upperBound - 100 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    const lease = upperBound - 50
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, stage: value }) =>
        okAsync({
          domains:
            current.id === 'ens_v1_reserved' && value.id === 'grace-7d'
              ? [
                  domain('lease.eth', lease, {
                    owner: '0xabc',
                    registrationStatus: 'wrapped',
                    graceEndDate: lease + 90 * DAY + 1,
                  }),
                ]
              : [],
          hasMore: false,
        }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(sentEvents(sendBatch)).toEqual([
      {
        type: 'name_expiring',
        name: 'lease.eth',
        expiryDate: lease,
        graceEndDate: lease + 90 * DAY + 1,
        stage: 'grace-7d',
        owner: '0xabc',
        includeFavorites: true,
      },
    ])
  })
  it('notifies a subname holder at its expiry, and only from the subname track', async () => {
    const kv = new MockKV()
    const cursors = caughtUpCursors()
    const upperBound = getUpperBoundForStage(stage('expired'), SUBNAME, NOW)
    expect(upperBound).toBe(NOW)
    cursors.subname.expired = { expiry_timestamp: upperBound - 100 }
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, cursors)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, stage: value }) =>
        okAsync({
          domains:
            current.id === 'subname' && value.id === 'expired'
              ? [
                  domain('pay.alice.eth', upperBound - 50, {
                    owner: '0xabc',
                    registrationStatus: 'wrapped',
                    graceEndDate: upperBound - 50,
                  }),
                  // The unfiltered window's `.eth` names are not the track's.
                  domain('alice.eth', upperBound - 20, {
                    inTrack: false,
                    owner: '0xdef',
                  }),
                ]
              : [],
          hasMore: false,
        }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(sentEvents(sendBatch)).toEqual([
      {
        type: 'name_expiring',
        name: 'pay.alice.eth',
        expiryDate: upperBound - 50,
        graceEndDate: upperBound - 50,
        stage: 'expired',
        owner: '0xabc',
        includeFavorites: true,
      },
    ])
    const stored = await readCursors(kv)
    expect(stored.subname.expired?.expiry_timestamp).toBe(upperBound - 20)
  })

  it('emits only subname stages for a subname after a long catch-up gap', async () => {
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      Object.fromEntries(
        TRACKS.map((value) => [
          value.id,
          Object.fromEntries(
            value.stages.map((current) => [
              current.id,
              { expiry_timestamp: NOW - 100 * DAY },
            ]),
          ),
        ]),
      ),
    )
    const targetExpiry = NOW - DAY
    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ track: current, cursor, upperBound }) =>
        okAsync({
          domains:
            current.id === 'subname' &&
            targetExpiry > cursor &&
            targetExpiry <= upperBound
              ? [
                  domain('pay.alice.eth', targetExpiry, {
                    registrationStatus: 'wrapped',
                    owner: '0xabc',
                  }),
                ]
              : [],
          hasMore: false,
        }),
    )
    const sendBatch = vi.fn(
      async (_messages: Array<{ body: unknown }>) => undefined,
    )

    await runExpiryDiscoveryCron(makeEnv(kv, sendBatch))

    expect(sentEvents(sendBatch)).toEqual([
      expect.objectContaining({ name: 'pay.alice.eth', stage: 'expired' }),
    ])
  })
})
