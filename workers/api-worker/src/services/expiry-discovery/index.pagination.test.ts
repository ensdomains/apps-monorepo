import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '#utils/logger.js'

vi.mock('./indexer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./indexer.js')>()
  return {
    ...actual,
    fetchExpiringNamesPage: vi.fn(),
  }
})

vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest: vi.fn(() => okAsync({ message_id: 1 })),
}))

import { KV_KEY } from '#core/kv/index.js'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import { runExpiryDiscoveryCron } from './index.js'
import {
  type ExpiringDomain,
  fetchExpiringNamesPage,
  PROCESS_PAGE_SIZE,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import { requireStoredCursors } from './test-helpers.js'

const DAY = 86_400
const NOW = '2026-02-11T12:00:00Z'

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
}

function nowSec() {
  return Math.floor(new Date(NOW).getTime() / 1000)
}

function domainName(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, '0')}.eth`
}

function uniqueDomains(count: number, startExpiry: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    name: domainName(prefix, index),
    expiryDate: startExpiry + index,
  }))
}

function domainsAt(count: number, expiryDate: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    name: domainName(prefix, index),
    expiryDate,
  }))
}

function caughtUpExceptExpiry30d(now: number, expiry30dCursor: number) {
  return {
    'expiry-30d': { expiry_timestamp: expiry30dCursor },
    'expiry-7d': { expiry_timestamp: now + 8 * DAY },
    'expiry-1d': { expiry_timestamp: now + 2 * DAY },
    'grace-start': { expiry_timestamp: now },
    'grace-7d': { expiry_timestamp: now - 21 * DAY },
    'grace-1d': { expiry_timestamp: now - 27 * DAY },
    'premium-start': { expiry_timestamp: now - 28 * DAY },
  }
}

function installFakeIndexer(domains: ExpiringDomain[]) {
  const sorted = [...domains].sort((left, right) => {
    if (left.expiryDate !== right.expiryDate) {
      return left.expiryDate - right.expiryDate
    }
    return left.name.localeCompare(right.name)
  })

  vi.mocked(fetchExpiringNamesPage).mockImplementation(
    ({ cursor, upperBound }) => {
      const matched = sorted.filter(
        (domain) =>
          domain.expiryDate > cursor && domain.expiryDate <= upperBound,
      )
      return okAsync({
        domains: matched.slice(0, QUERY_PAGE_SIZE),
        hasMore: matched.length > QUERY_PAGE_SIZE,
      })
    },
  )
}

function enqueuedNames(
  sendBatch: ReturnType<typeof vi.fn>,
): Array<{ name: string; expiryDate: number; stage: string }> {
  return sendBatch.mock.calls.flatMap((call) => {
    const batch = call[0]
    if (!Array.isArray(batch)) {
      throw new Error(
        'Test setup error: expected sendBatch to receive a message array',
      )
    }
    return batch.map(
      (message: {
        body: { name: string; expiryDate: number; stage: string }
      }) => {
        if (!message?.body?.name) {
          throw new Error(
            'Test setup error: expected enqueued expiry event body',
          )
        }
        return message.body
      },
    )
  })
}

function expiry30dCalls() {
  return vi
    .mocked(fetchExpiringNamesPage)
    .mock.calls.map(([argument]) => {
      if (!argument) {
        throw new Error('Test setup error: expected indexer call arguments')
      }
      return argument
    })
    .filter((argument) => argument.stage.id === 'expiry-30d')
}

async function readCursors(kv: MockKV) {
  return requireStoredCursors(
    await kv.get(KV_KEY.EXPIRY_DISCOVERY.CURSORS, 'json'),
  )
}

function createEnv(
  kv: MockKV,
  sendBatch: ReturnType<typeof vi.fn>,
  extra?: object,
) {
  return {
    KV: kv,
    EVENT_INGESTION_QUEUE: { sendBatch },
    ...extra,
  } as unknown as CloudflareBindings
}

describe('expiry discovery cursor pagination', () => {
  const now = nowSec()
  const stageCursor = now + 7 * DAY
  const timestampT = stageCursor + 2_000
  const timestampB = stageCursor + 5_000

  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(makeTelegramRequest).mockReset()
    vi.mocked(makeTelegramRequest).mockReturnValue(
      okAsync({ message_id: 1 }) as ReturnType<typeof makeTelegramRequest>,
    )
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  async function runIsolatedStage(
    domains: ExpiringDomain[],
    extraEnv?: object,
  ) {
    const sendBatch = vi.fn(async () => undefined)
    const kv = new MockKV()
    kv.seed(
      KV_KEY.EXPIRY_DISCOVERY.CURSORS,
      caughtUpExceptExpiry30d(now, stageCursor),
    )
    installFakeIndexer(domains)
    const env = createEnv(kv, sendBatch, extraEnv)
    const result = await runExpiryDiscoveryCron(env)
    expect(result.isOk()).toBe(true)
    return { env, kv, sendBatch, result }
  }

  it('processes fewer than a page of names and does not issue a boundary query', async () => {
    const domains = uniqueDomains(250, stageCursor + 1, 'small')
    const { sendBatch, kv } = await runIsolatedStage(domains)
    const bodies = enqueuedNames(sendBatch)

    expect(bodies).toHaveLength(250)
    expect(new Set(bodies.map((body) => body.name)).size).toBe(250)
    expect(expiry30dCalls()).toHaveLength(1)
    expect(expiry30dCalls()[0]?.cursor).toBe(stageCursor)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      stageCursor + 250,
    )
  })

  it('processes exactly PROCESS_PAGE_SIZE unique timestamps', async () => {
    const domains = uniqueDomains(PROCESS_PAGE_SIZE, stageCursor + 1, 'exact')
    const { sendBatch, kv } = await runIsolatedStage(domains)
    const bodies = enqueuedNames(sendBatch)

    expect(bodies).toHaveLength(PROCESS_PAGE_SIZE)
    expect(expiry30dCalls()).toHaveLength(1)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      stageCursor + PROCESS_PAGE_SIZE,
    )
  })

  it('leaves the lookahead row for the next invocation when 1001 timestamps are unique', async () => {
    const domains = uniqueDomains(QUERY_PAGE_SIZE, stageCursor + 1, 'unique')
    const first = await runIsolatedStage(domains)
    const firstNames = enqueuedNames(first.sendBatch).map((body) => body.name)

    expect(firstNames).toHaveLength(PROCESS_PAGE_SIZE)
    expect(firstNames).not.toContain(domainName('unique', 1000))
    expect(expiry30dCalls()).toHaveLength(1)
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      stageCursor + PROCESS_PAGE_SIZE,
    )

    first.sendBatch.mockClear()
    vi.mocked(fetchExpiringNamesPage).mockClear()
    installFakeIndexer(domains)
    const second = await runExpiryDiscoveryCron(first.env)
    expect(second.isOk()).toBe(true)

    const secondNames = enqueuedNames(first.sendBatch).map((body) => body.name)
    expect(secondNames).toEqual([domainName('unique', 1000)])
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      stageCursor + QUERY_PAGE_SIZE,
    )
  })

  it.each([
    { earlierCount: 999, tiedCount: 50 },
    { earlierCount: 950, tiedCount: 100 },
    { earlierCount: 500, tiedCount: 700 },
  ])('re-queries timestamp T when $earlierCount earlier names + $tiedCount at T cross the page boundary', async ({
    earlierCount,
    tiedCount,
  }) => {
    const earlier = uniqueDomains(earlierCount, stageCursor + 1, 'earlier')
    const tied = domainsAt(tiedCount, timestampT, 'tied')
    const { sendBatch, kv } = await runIsolatedStage([...earlier, ...tied])
    const bodies = enqueuedNames(sendBatch)
    const names = bodies.map((body) => body.name)

    expect(bodies).toHaveLength(earlierCount + tiedCount)
    expect(new Set(names).size).toBe(earlierCount + tiedCount)
    expect(names).toEqual(
      expect.arrayContaining([
        domainName('earlier', 0),
        domainName('earlier', earlierCount - 1),
        domainName('tied', 0),
        domainName('tied', tiedCount - 1),
      ]),
    )

    const calls = expiry30dCalls()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(
      expect.objectContaining({
        cursor: timestampT - 1,
        upperBound: timestampT,
      }),
    )
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )
  })

  it('does not special-case a shared timestamp that fits exactly in one page', async () => {
    const earlier = uniqueDomains(900, stageCursor + 1, 'earlier')
    const tied = domainsAt(100, timestampT, 'tied')
    const { sendBatch, kv } = await runIsolatedStage([...earlier, ...tied])
    const bodies = enqueuedNames(sendBatch)

    expect(bodies).toHaveLength(PROCESS_PAGE_SIZE)
    expect(expiry30dCalls()).toHaveLength(1)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )
  })

  it('treats 1000 names at T plus a later lookahead row as a safe boundary', async () => {
    const tied = domainsAt(PROCESS_PAGE_SIZE, timestampT, 'tied')
    const later = uniqueDomains(1, timestampT + 10, 'later')
    const first = await runIsolatedStage([...tied, ...later])
    const firstNames = enqueuedNames(first.sendBatch).map((body) => body.name)

    expect(firstNames).toHaveLength(PROCESS_PAGE_SIZE)
    expect(firstNames).not.toContain(domainName('later', 0))
    expect(expiry30dCalls()).toHaveLength(1)
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )

    first.sendBatch.mockClear()
    vi.mocked(fetchExpiringNamesPage).mockClear()
    installFakeIndexer([...tied, ...later])
    const second = await runExpiryDiscoveryCron(first.env)
    expect(second.isOk()).toBe(true)
    expect(enqueuedNames(first.sendBatch).map((body) => body.name)).toEqual([
      domainName('later', 0),
    ])
  })

  it('skips excess names at T, advances the cursor, and continues after overflow', async () => {
    const errorSpy = vi.spyOn(logger, 'error')
    const tied = domainsAt(QUERY_PAGE_SIZE + 50, timestampT, 'overflow')
    const later = uniqueDomains(3, timestampT + 20, 'later')
    const first = await runIsolatedStage([...tied, ...later], {
      EXPIRY_ALERT_TELEGRAM_CHAT_ID: '-100123456',
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
    })
    const firstNames = enqueuedNames(first.sendBatch).map((body) => body.name)

    expect(firstNames).toHaveLength(PROCESS_PAGE_SIZE)
    expect(firstNames).not.toContain(domainName('overflow', 1000))
    expect(firstNames).not.toContain(domainName('later', 0))
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )

    expect(errorSpy).toHaveBeenCalledWith(
      'Expiry discovery skipped names sharing one expiry timestamp',
      expect.objectContaining({
        stage: 'expiry-30d',
        expiryTimestamp: timestampT,
        processedCount: PROCESS_PAGE_SIZE,
        maxPerTimestamp: PROCESS_PAGE_SIZE,
      }),
    )
    expect(makeTelegramRequest).toHaveBeenCalledWith(
      'test-bot-token',
      'sendMessage',
      expect.objectContaining({
        chat_id: '-100123456',
      }),
    )

    first.sendBatch.mockClear()
    vi.mocked(fetchExpiringNamesPage).mockClear()
    installFakeIndexer([...tied, ...later])
    const second = await runExpiryDiscoveryCron(first.env)
    expect(second.isOk()).toBe(true)

    const secondNames = enqueuedNames(first.sendBatch).map((body) => body.name)
    expect(secondNames).toEqual([
      domainName('later', 0),
      domainName('later', 1),
      domainName('later', 2),
    ])
    expect(secondNames).not.toContain(domainName('overflow', 1000))
    errorSpy.mockRestore()
  })

  it('continues discovery when the Telegram overflow alert throws', async () => {
    const errorSpy = vi.spyOn(logger, 'error')
    vi.mocked(makeTelegramRequest).mockImplementation(() => {
      throw new Error('telegram unavailable')
    })

    const tied = domainsAt(QUERY_PAGE_SIZE, timestampT, 'overflow')
    const { sendBatch, kv, result } = await runIsolatedStage(tied, {
      EXPIRY_ALERT_TELEGRAM_CHAT_ID: '-100123456',
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
    })

    expect(result.isOk()).toBe(true)
    expect(enqueuedNames(sendBatch)).toHaveLength(PROCESS_PAGE_SIZE)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )
    expect(errorSpy).toHaveBeenCalledWith(
      'Expiry discovery skipped names sharing one expiry timestamp',
      expect.objectContaining({ expiryTimestamp: timestampT }),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      'Expiry overflow Telegram alert failed',
      expect.objectContaining({ error: expect.any(Error) }),
    )
    errorSpy.mockRestore()
  })

  it('logs overflow without attempting Telegram when no alert destination is configured', async () => {
    const errorSpy = vi.spyOn(logger, 'error')
    const tied = domainsAt(QUERY_PAGE_SIZE, timestampT, 'overflow')
    const { sendBatch, kv } = await runIsolatedStage(tied)

    expect(enqueuedNames(sendBatch)).toHaveLength(PROCESS_PAGE_SIZE)
    expect((await readCursors(kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampT,
    )
    expect(errorSpy).toHaveBeenCalledWith(
      'Expiry discovery skipped names sharing one expiry timestamp',
      expect.objectContaining({ expiryTimestamp: timestampT }),
    )
    expect(makeTelegramRequest).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('processes a mixed multi-page sequence with intentional overflow at B', async () => {
    const errorSpy = vi.spyOn(logger, 'error')
    const earlier = uniqueDomains(500, stageCursor + 1, 'earlier')
    const atB = domainsAt(1_200, timestampB, 'b')
    const later = uniqueDomains(300, timestampB + 50, 'later')
    const all = [...earlier, ...atB, ...later]

    const first = await runIsolatedStage(all, {
      EXPIRY_ALERT_TELEGRAM_CHAT_ID: '-100999',
      TELEGRAM_BOT_TOKEN: 'token',
    })
    const firstNames = enqueuedNames(first.sendBatch).map((body) => body.name)

    expect(firstNames).toHaveLength(500 + PROCESS_PAGE_SIZE)
    expect(firstNames).toEqual(
      expect.arrayContaining([
        domainName('earlier', 0),
        domainName('earlier', 499),
        domainName('b', 0),
      ]),
    )
    expect(firstNames).not.toContain(domainName('b', 1000))
    expect(firstNames).not.toContain(domainName('later', 0))
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampB,
    )
    expect(errorSpy).toHaveBeenCalledWith(
      'Expiry discovery skipped names sharing one expiry timestamp',
      expect.objectContaining({ expiryTimestamp: timestampB }),
    )

    first.sendBatch.mockClear()
    vi.mocked(fetchExpiringNamesPage).mockClear()
    installFakeIndexer(all)
    const second = await runExpiryDiscoveryCron(first.env)
    expect(second.isOk()).toBe(true)

    const secondNames = enqueuedNames(first.sendBatch).map((body) => body.name)
    expect(secondNames).toHaveLength(300)
    expect(secondNames[0]).toBe(domainName('later', 0))
    expect(secondNames[299]).toBe(domainName('later', 299))
    expect(secondNames.some((name) => name.startsWith('b-'))).toBe(false)
    expect((await readCursors(first.kv))['expiry-30d']?.expiry_timestamp).toBe(
      timestampB + 50 + 299,
    )
    errorSpy.mockRestore()
  })

  it('does not advance a failed stage cursor while still committing others', async () => {
    const sendBatch = vi.fn(async () => undefined)
    const kv = new MockKV()
    kv.seed(KV_KEY.EXPIRY_DISCOVERY.CURSORS, {
      ...caughtUpExceptExpiry30d(now, stageCursor),
      'expiry-7d': { expiry_timestamp: now },
    })

    const earlier = uniqueDomains(999, stageCursor + 1, 'earlier')
    const tied = domainsAt(50, timestampT, 'tied')
    const domains = [...earlier, ...tied]

    vi.mocked(fetchExpiringNamesPage).mockImplementation(
      ({ stage, cursor, upperBound }) => {
        if (
          stage.id === 'expiry-30d' &&
          cursor === timestampT - 1 &&
          upperBound === timestampT
        ) {
          return errAsync(new Error('exact timestamp query failed') as never)
        }
        if (stage.id === 'expiry-7d') {
          return okAsync({
            domains: [{ name: 'other-stage.eth', expiryDate: now + DAY - 10 }],
            hasMore: false,
          })
        }
        const matched = domains.filter(
          (domain) =>
            domain.expiryDate > cursor && domain.expiryDate <= upperBound,
        )
        return okAsync({
          domains: matched.slice(0, QUERY_PAGE_SIZE),
          hasMore: matched.length > QUERY_PAGE_SIZE,
        })
      },
    )

    const env = createEnv(kv, sendBatch)
    const result = await runExpiryDiscoveryCron(env)
    expect(result.isOk()).toBe(true)

    const cursors = await readCursors(kv)
    expect(cursors['expiry-30d']?.expiry_timestamp).toBe(stageCursor)
    expect(cursors['expiry-7d']?.expiry_timestamp).toBe(now + DAY - 10)
    expect(
      enqueuedNames(sendBatch).some((body) => body.stage === 'expiry-30d'),
    ).toBe(false)
  })

  it('survives a load/store cursor round trip across cron invocations', async () => {
    const domains = uniqueDomains(10, stageCursor + 1, 'persist')
    const first = await runIsolatedStage(domains)
    const afterFirst = await readCursors(first.kv)
    expect(afterFirst['expiry-30d']?.expiry_timestamp).toBe(stageCursor + 10)

    first.sendBatch.mockClear()
    const stored = first.kv
    const secondEnv = createEnv(stored, first.sendBatch)
    installFakeIndexer(domains)
    const second = await runExpiryDiscoveryCron(secondEnv)
    expect(second.isOk()).toBe(true)
    expect(enqueuedNames(first.sendBatch)).toHaveLength(0)
    expect((await readCursors(stored))['expiry-30d']?.expiry_timestamp).toBe(
      stageCursor + 10,
    )
  })
})
