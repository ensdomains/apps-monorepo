import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBigname } from '#core/bigname/index.js'
import { makeMockEnv } from '#test-utils/env.js'
import { runExpiryDiscoveryCron } from './index.js'
import {
  EXACT_TIMESTAMP_MAX_ROWS,
  fetchExpiringNamesPage,
  fetchExpiringNamesPages,
  fetchPublicationTime,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import { type ExpiryTrackId, getUpperBoundForStage, TRACKS } from './stages.js'

vi.mock('#core/bigname/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/bigname/index.js')>()
  return { ...actual, createBigname: vi.fn(actual.createBigname) }
})

const DAY = 86_400
const RESERVATION_GAP = 62 * DAY + 1
const ts = (seconds: number) => String(seconds)

const track = (id: ExpiryTrackId) => {
  const value = TRACKS.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing track: ${id}`)
  return value
}

type Row = {
  name: string
  expires_window_index?: number
  expires_at?: string
  grace_ends_at?: string
  owner?: string
  authority?: string
  registration_status?: string
  ens_v1?: { expires_at?: string | null }
  lapsed_registration?: { owner?: string; release_kind?: string }
}

const row = (overrides: Row) => ({
  display_name: overrides.name,
  namespace: 'ens',
  namehash: `0x${'0'.repeat(64)}`,
  registration_status: 'active',
  ...overrides,
})

/** An ENSv2 row: served expiry is the registration's, 28-day grace. */
const v2Row = (name: string, expiry: number, overrides: Partial<Row> = {}) => ({
  name,
  expires_at: ts(expiry),
  grace_ends_at: ts(expiry + 28 * DAY),
  ...overrides,
})

/** An ENSv1 lease row, optionally behind a live ENSv2 reservation. */
const v1Row = (
  name: string,
  lease: number,
  reservedFor: number | null,
  overrides: Partial<Row> = {},
) => {
  const served = reservedFor === null ? lease : lease + reservedFor
  return {
    name,
    expires_at: ts(served),
    grace_ends_at: ts(
      reservedFor === null ? lease + 90 * DAY : served + 28 * DAY,
    ),
    ens_v1: { expires_at: ts(lease) },
    ...overrides,
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const page = (
  rows: Row[],
  nextCursor: string | null = null,
  meta: Record<string, unknown> = {},
) =>
  json(200, {
    data: rows.map(row),
    page: {
      cursor: null,
      next_cursor: nextCursor,
      page_size: 200,
      total_count: null,
      has_more: nextCursor !== null,
    },
    meta,
  })

const error = (status: number, code: string) =>
  json(status, { error: { code, message: code, details: {} } })

const rowsFrom = (start: number, count: number): Row[] =>
  Array.from({ length: count }, (_, index) =>
    v2Row(`${start + index}.eth`, 1_700_000_000 + start + index),
  )

const mockFetch = (...responses: Response[]) => {
  const queue = [...responses]
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
    const next = queue.shift()
    if (!next) throw new Error('unexpected fetch')
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    url: (call: number) => new URL(String(fetchMock.mock.calls[call]?.[0])),
  }
}

const firstStage = (trackId: ExpiryTrackId) => {
  const stage = track(trackId).stages[0]
  if (!stage) throw new Error(`Missing stage for track: ${trackId}`)
  return stage
}

const fetchWindow = (
  cursor: number,
  upperBound: number,
  trackId: ExpiryTrackId = 'eth',
) =>
  fetchExpiringNamesPage({
    env: makeMockEnv(),
    track: track(trackId),
    stage: firstStage(trackId),
    cursor,
    upperBound,
  })

describe('fetchExpiringNamesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('maps the (cursor, upperBound] window onto the ENSv2 sweep and rows', async () => {
    const { fetchMock, url } = mockFetch(
      page([
        v2Row('alpha.eth', 1_700_000_000, {
          owner: '0xABC',
          registration_status: 'registered',
        }),
        v2Row('lapsed.eth', 1_700_000_002, {
          registration_status: 'released',
          lapsed_registration: { owner: '0xDEF', release_kind: 'expired' },
        }),
      ]),
    )

    const result = await fetchWindow(1_699_999_999, 1_700_000_100)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = url(0)
    expect(request.origin).toBe('https://sepolia.api.bigname.sh')
    expect(request.pathname).toBe('/v1/names')
    expect(Object.fromEntries(request.searchParams)).toEqual({
      namespace: 'ens',
      parent: 'eth',
      // expires_after is inclusive: cursor + 1 keeps `expiry > cursor`.
      expires_after: '1700000000',
      // expires_before is exclusive: upperBound + 1 keeps `expiry <= upperBound`.
      expires_before: '1700000101',
      sort: 'expires_at',
      order: 'asc',
      page_size: '200',
    })

    expect(result._unsafeUnwrap()).toEqual({
      domains: [
        {
          name: 'alpha.eth',
          expiryDate: 1_700_000_000,
          inTrack: true,
          graceEndDate: 1_700_000_000 + 28 * DAY,
          owner: '0xabc',
          registrationStatus: 'registered',
          releaseKind: undefined,
        },
        {
          name: 'lapsed.eth',
          expiryDate: 1_700_000_002,
          inTrack: true,
          graceEndDate: 1_700_000_002 + 28 * DAY,
          // A released row has no owner; its last holder is the recipient.
          owner: '0xdef',
          registrationStatus: 'released',
          releaseKind: 'expired',
        },
      ],
      hasMore: false,
    })
  })

  it('uses the same served-expiry window for registrations and reservations', async () => {
    const expiry = 1_700_000_000
    const { url } = mockFetch(
      page([
        v2Row('registered.eth', expiry, {
          authority: 'ens_v2',
          owner: '0xabc',
        }),
        v1Row('reserved.eth', expiry - RESERVATION_GAP, RESERVATION_GAP, {
          authority: 'ens_v1',
          owner: '0xdef',
          registration_status: 'wrapped',
        }),
      ]),
    )
    const result = (await fetchWindow(expiry - 1, expiry + 100))._unsafeUnwrap()
    expect(url(0).searchParams.get('parent')).toBe('eth')
    expect(url(0).searchParams.has('authority')).toBe(false)
    expect(url(0).searchParams.get('expires_after')).toBe(ts(expiry))
    expect(
      result.domains.map(({ name, expiryDate, graceEndDate, inTrack }) => ({
        name,
        expiryDate,
        graceEndDate,
        inTrack,
      })),
    ).toEqual(
      ['registered.eth', 'reserved.eth'].map((name) => ({
        name,
        expiryDate: expiry,
        graceEndDate: expiry + 28 * DAY,
        inTrack: true,
      })),
    )
  })

  it('excludes subnames and other namespaces even if returned by the API', async () => {
    const expiry = 1_700_000_000
    mockFetch(
      page([
        v2Row('alice.eth', expiry),
        v2Row('pay.alice.eth', expiry),
        {
          name: 'wrapped.alice.eth',
          expires_at: ts(expiry),
          grace_ends_at: ts(expiry),
          registration_status: 'wrapped',
        },
        v2Row('alice.com', expiry),
      ]),
    )
    const result = (await fetchWindow(expiry - 1, expiry + 100))._unsafeUnwrap()
    expect(
      result.domains.filter(({ inTrack }) => inTrack).map(({ name }) => name),
    ).toEqual(['alice.eth'])
  })

  it('queries a single second for an exact-timestamp window', async () => {
    const { url } = mockFetch(page([]))
    const timestamp = 1_700_000_000

    await fetchWindow(timestamp - 1, timestamp)

    expect(url(0).searchParams.get('expires_after')).toBe(ts(timestamp))
    expect(url(0).searchParams.get('expires_before')).toBe(ts(timestamp + 1))
  })

  it('skips the request for an empty or inverted window', async () => {
    const { fetchMock } = mockFetch()

    const result = await fetchWindow(200, 200)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result._unsafeUnwrap()).toEqual({ domains: [], hasMore: false })
  })

  it('walks cursor pages up to QUERY_PAGE_SIZE rows and reports more', async () => {
    const { fetchMock, url } = mockFetch(
      page(rowsFrom(0, 200), 'c1'),
      page(rowsFrom(200, 200), 'c2'),
      page(rowsFrom(400, 200), 'c3'),
      page(rowsFrom(600, 200), 'c4'),
      page(rowsFrom(800, 200), 'c5'),
    )

    const result = (await fetchWindow(1, 2_000_000_000))._unsafeUnwrap()

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(url(1).searchParams.get('cursor')).toBe('c1')
    expect(url(4).searchParams.get('cursor')).toBe('c4')
    expect(result.domains).toHaveLength(QUERY_PAGE_SIZE)
    expect(result.domains.at(-1)?.name).toBe('999.eth')
    expect(result.hasMore).toBe(true)
  })

  it('walks past QUERY_PAGE_SIZE when a larger maxRows is given', async () => {
    const { fetchMock } = mockFetch(
      ...Array.from({ length: 6 }, (_, index) =>
        page(rowsFrom(index * 200, 200), `c${index + 1}`),
      ),
      page(rowsFrom(1_200, 10)),
    )

    const result = (
      await fetchExpiringNamesPage({
        env: makeMockEnv(),
        track: track('eth'),
        stage: firstStage('eth'),
        cursor: 1,
        upperBound: 2_000_000_000,
        maxRows: EXACT_TIMESTAMP_MAX_ROWS,
      })
    )._unsafeUnwrap()

    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(result.domains).toHaveLength(1_210)
    expect(result.hasMore).toBe(false)
  })

  it('reports no more rows when the last page ends the window', async () => {
    mockFetch(page(rowsFrom(0, 200), 'c1'), page(rowsFrom(200, 5)))

    const result = (await fetchWindow(1, 2_000_000_000))._unsafeUnwrap()

    expect(result.domains).toHaveLength(205)
    expect(result.hasMore).toBe(false)
  })

  it('retries a stale continuation with the same cursor', async () => {
    const { fetchMock, url } = mockFetch(
      page(rowsFrom(0, 200), 'c1'),
      error(409, 'stale'),
      page(rowsFrom(200, 3)),
    )

    const promise = fetchWindow(1, 2_000_000_000)
    await vi.runAllTimersAsync()
    const result = (await promise)._unsafeUnwrap()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(url(2).searchParams.get('cursor')).toBe('c1')
    expect(result.domains).toHaveLength(203)
    expect(new Set(result.domains.map((domain) => domain.name)).size).toBe(203)
  })

  it('retries transient errors and succeeds', async () => {
    const { fetchMock } = mockFetch(error(503, 'overloaded'), page([]))

    const promise = fetchWindow(1, 2)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.isOk()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry client errors', async () => {
    const { fetchMock } = mockFetch(error(400, 'invalid_input'))

    const result = await fetchWindow(1, 2)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const failure = result._unsafeUnwrapErr()
    expect(failure._tag).toBe('INDEXER_REQUEST_ERROR')
    expect(failure).toMatchObject({ status: 400 })
  })

  it.each([
    { label: 'missing', expires_at: undefined },
    { label: 'unparseable', expires_at: 'not-a-timestamp' },
    { label: 'RFC 3339', expires_at: '2023-11-14T22:13:20Z' },
  ])('fails validation on a $label expires_at', async ({ expires_at }) => {
    mockFetch(page([{ name: 'bad.eth', expires_at }]))

    const result = await fetchWindow(1, 2)

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('returns a config error when the client cannot be built', async () => {
    const { fetchMock } = mockFetch()
    vi.mocked(createBigname).mockImplementationOnce(() => {
      throw new Error('unknown CHAIN')
    })

    const result = await fetchWindow(1, 2)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_CONFIG_ERROR')
  })
})

describe('fetchPublicationTime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the smallest meta.as_of timestamp from a one-row page', async () => {
    const { url } = mockFetch(
      page([], null, {
        as_of: {
          '1': { block_number: 1, block_hash: '0x1', timestamp: '1700000050' },
          '11155111': {
            block_number: 2,
            block_hash: '0x2',
            timestamp: '1700000040',
          },
        },
      }),
    )

    const result = await fetchPublicationTime({
      env: makeMockEnv(),
      nowSec: 1_700_000_100,
    })

    expect(result._unsafeUnwrap()).toBe(1_700_000_040)
    expect(Object.fromEntries(url(0).searchParams)).toEqual({
      namespace: 'ens',
      parent: 'eth',
      expires_after: '1700000100',
      page_size: '1',
    })
  })

  it('fails when the page names no publication', async () => {
    mockFetch(page([]))

    const result = await fetchPublicationTime({
      env: makeMockEnv(),
      nowSec: 1_700_000_100,
    })

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })
})

describe('batched expiry windows', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const secondStage = track('eth').stages[1]
  if (!secondStage) throw new Error('Missing second ENSv2 stage')
  const windows = [
    { stage: firstStage('eth'), cursor: 100, upperBound: 200 },
    { stage: secondStage, cursor: 300, upperBound: 400 },
  ] as const
  const fetchWindows = () =>
    fetchExpiringNamesPages({
      env: makeMockEnv(),
      track: track('eth'),
      windows,
    })

  it('reads multiple reminder bands once and assigns rows by server window index', async () => {
    const { fetchMock, url } = mockFetch(
      page([
        v1Row('early.eth', 150 - RESERVATION_GAP, RESERVATION_GAP, {
          authority: 'ens_v1',
          expires_window_index: 0,
        }),
        v2Row('late.eth', 350, { expires_window_index: 1 }),
      ]),
    )
    const result = (await fetchWindows())._unsafeUnwrap()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(url(0).searchParams.getAll('expires_window')).toEqual([
      '101..201',
      '301..401',
    ])
    expect(url(0).searchParams.has('expires_after')).toBe(false)
    expect(url(0).searchParams.get('parent')).toBe('eth')
    expect(url(0).searchParams.has('authority')).toBe(false)
    expect(result.get(windows[0].stage.id)?.domains[0]).toMatchObject({
      expiryDate: 150,
      inTrack: true,
    })
    expect(
      result.get(windows[0].stage.id)?.domains.map((domain) => domain.name),
    ).toEqual(['early.eth'])
    expect(
      result.get(windows[1].stage.id)?.domains.map((domain) => domain.name),
    ).toEqual(['late.eth'])
  })

  it('continues with the same windows and cursor until the union is exhausted', async () => {
    const { url } = mockFetch(
      page([v2Row('early.eth', 150, { expires_window_index: 0 })], 'next'),
      page([v2Row('late.eth', 350, { expires_window_index: 1 })]),
    )
    const result = (await fetchWindows())._unsafeUnwrap()
    expect(result.size).toBe(2)
    expect(url(1).searchParams.get('cursor')).toBe('next')
    expect(url(1).searchParams.getAll('expires_window')).toEqual(
      url(0).searchParams.getAll('expires_window'),
    )
  })

  it('caps a dense band without starving a later reminder band', async () => {
    const dense = Array.from({ length: 5 }, (_, offset) =>
      page(
        Array.from({ length: 200 }, (_, index) =>
          v2Row(`${offset * 200 + index}.eth`, 150, {
            expires_window_index: 0,
          }),
        ),
        `page-${offset + 1}`,
      ),
    )
    const { fetchMock, url } = mockFetch(
      ...dense,
      page([v2Row('late.eth', 350, { expires_window_index: 0 })]),
    )
    const result = (await fetchWindows())._unsafeUnwrap()
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(result.get(windows[0].stage.id)?.domains).toHaveLength(
      QUERY_PAGE_SIZE,
    )
    expect(result.get(windows[0].stage.id)?.hasMore).toBe(true)
    expect(
      result.get(windows[1].stage.id)?.domains.map((domain) => domain.name),
    ).toEqual(['late.eth'])
    expect(url(5).searchParams.getAll('expires_window')).toEqual(['301..401'])
    expect(url(5).searchParams.has('cursor')).toBe(false)
  })

  it('drops every partial bucket when a stale continuation restarts the union', async () => {
    const { url } = mockFetch(
      page([v2Row('old.eth', 150, { expires_window_index: 0 })], 'old-cursor'),
      ...Array.from({ length: 4 }, () => error(409, 'stale')),
      page([v2Row('fresh.eth', 350, { expires_window_index: 1 })]),
    )
    const resultPromise = fetchWindows()
    await vi.runAllTimersAsync()
    const result = (await resultPromise)._unsafeUnwrap()
    expect(result.get(windows[0].stage.id)?.domains).toEqual([])
    expect(
      result.get(windows[1].stage.id)?.domains.map((domain) => domain.name),
    ).toEqual(['fresh.eth'])
    expect(url(5).searchParams.has('cursor')).toBe(false)
    expect(url(5).searchParams.getAll('expires_window')).toEqual(
      url(0).searchParams.getAll('expires_window'),
    )
  })

  it('does not constrain later windows to a nearly full earlier bucket', async () => {
    const responses = Array.from({ length: 4 }, (_, offset) =>
      page(
        Array.from({ length: 200 }, (_, index) =>
          v2Row(`${offset * 200 + index}.eth`, 150, {
            expires_window_index: 0,
          }),
        ),
        `early-${offset}`,
      ),
    )
    responses.push(
      page(
        [
          ...Array.from({ length: 199 }, (_, index) =>
            v2Row(`${800 + index}.eth`, 150, { expires_window_index: 0 }),
          ),
          v2Row('late.eth', 350, { expires_window_index: 1 }),
        ],
        'later',
      ),
    )
    responses.push(page([v2Row('late2.eth', 351, { expires_window_index: 1 })]))
    const { url } = mockFetch(...responses)
    const result = (await fetchWindows())._unsafeUnwrap()
    expect(result.get(windows[0].stage.id)?.domains).toHaveLength(999)
    expect(result.get(windows[1].stage.id)?.domains).toHaveLength(2)
    expect(url(5).searchParams.get('page_size')).toBe('200')
  })

  it('rejects unassigned rows instead of advancing empty stage checkpoints', async () => {
    mockFetch(page([v2Row('unknown.eth', 150)]))
    const result = await fetchWindows()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('expires_window_index')
  })

  it('runs all seven open stages in two HTTP requests including the publication probe', async () => {
    const now = 1_700_000_000
    vi.setSystemTime(now * 1000)
    const { fetchMock, url } = mockFetch(
      page([], null, {
        as_of: {
          '1': { block_number: 1, block_hash: '0x1', timestamp: String(now) },
        },
      }),
      page([]),
    )
    const env = makeMockEnv()
    const storedCursors = Object.fromEntries(
      TRACKS.map((track) => [
        track.id,
        Object.fromEntries(
          track.stages.map((stage) => [
            stage.id,
            {
              expiry_timestamp: getUpperBoundForStage(stage, track, now) - 60,
            },
          ]),
        ),
      ]),
    )
    Object.assign(env.KV, { get: vi.fn(async () => storedCursors) })
    const result = await runExpiryDiscoveryCron(env)
    expect(result._unsafeUnwrap().failedStages).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      [1].map(
        (index) => url(index).searchParams.getAll('expires_window').length,
      ),
    ).toEqual([7])
  })

  it('does not issue a request when every stage is caught up', async () => {
    const { fetchMock } = mockFetch()
    const result = await fetchExpiringNamesPages({
      env: makeMockEnv(),
      track: track('eth'),
      windows: [],
    })
    expect(result._unsafeUnwrap().size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
