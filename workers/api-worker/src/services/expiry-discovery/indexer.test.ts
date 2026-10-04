import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBigname } from '#core/bigname/index.js'
import { makeMockEnv } from '#test-utils/env.js'
import {
  EXACT_TIMESTAMP_MAX_ROWS,
  fetchExpiringNamesPage,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import { STAGES } from './stages.js'

vi.mock('#core/bigname/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/bigname/index.js')>()
  return { ...actual, createBigname: vi.fn(actual.createBigname) }
})

const iso = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')

type Row = {
  name: string
  expires_at?: string
  owner?: string
  registrant?: string
  registration_status?: string
}

const row = (overrides: Row) => ({
  display_name: overrides.name,
  namespace: 'ens',
  namehash: `0x${'0'.repeat(64)}`,
  ...overrides,
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const page = (rows: Row[], nextCursor: string | null = null) =>
  json(200, {
    data: rows.map(row),
    page: {
      cursor: null,
      next_cursor: nextCursor,
      page_size: 200,
      total_count: null,
      has_more: nextCursor !== null,
    },
    meta: {},
  })

const error = (status: number, code: string) =>
  json(status, { error: { code, message: code, details: {} } })

const rowsFrom = (start: number, count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    name: `${start + index}.eth`,
    expires_at: iso(1_700_000_000 + start + index),
    registration_status: 'active',
  }))

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

const fetchWindow = (cursor: number, upperBound: number) =>
  fetchExpiringNamesPage({
    env: makeMockEnv(),
    stage: STAGES[0],
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

  it('maps the (cursor, upperBound] window onto bigname bounds and rows', async () => {
    const { fetchMock, url } = mockFetch(
      page([
        {
          name: 'alpha.eth',
          expires_at: iso(1_700_000_000),
          owner: '0xABC',
          registrant: '0xDEF',
          registration_status: 'active',
        },
        {
          name: 'beta.eth',
          // bigname may serve a numeric offset instead of Z.
          expires_at: '2023-11-14T22:13:21+00:00',
          registrant: '0xDEF',
          registration_status: 'wrapped',
        },
        {
          name: 'lapsed.eth',
          expires_at: iso(1_700_000_002),
          registration_status: 'released',
        },
      ]),
    )

    const result = await fetchWindow(1_699_999_999, 1_700_000_100)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = url(0)
    expect(request.origin).toBe('https://sepolia.api.bigname.sh')
    expect(request.pathname).toBe('/v1/names')
    expect(Object.fromEntries(request.searchParams)).toEqual({
      namespace: 'ens',
      // expires_after is inclusive: cursor + 1 keeps `expiry > cursor`.
      expires_after: '2023-11-14T22:13:20Z',
      // expires_before is exclusive: upperBound + 1 keeps `expiry <= upperBound`.
      expires_before: iso(1_700_000_101),
      sort: 'expires_at',
      order: 'asc',
      page_size: '200',
    })

    expect(result._unsafeUnwrap()).toEqual({
      domains: [
        {
          name: 'alpha.eth',
          expiryDate: 1_700_000_000,
          owner: '0xabc',
          registrationStatus: 'active',
        },
        {
          name: 'beta.eth',
          expiryDate: 1_700_000_001,
          owner: '0xdef',
          registrationStatus: 'wrapped',
        },
        {
          name: 'lapsed.eth',
          expiryDate: 1_700_000_002,
          owner: undefined,
          registrationStatus: 'released',
        },
      ],
      hasMore: false,
    })
  })

  it('queries a single second for an exact-timestamp window', async () => {
    const { url } = mockFetch(page([]))
    const timestamp = 1_700_000_000

    await fetchWindow(timestamp - 1, timestamp)

    expect(url(0).searchParams.get('expires_after')).toBe(iso(timestamp))
    expect(url(0).searchParams.get('expires_before')).toBe(iso(timestamp + 1))
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
        stage: STAGES[0],
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

  it('restarts from the first page when a continuation goes stale', async () => {
    const { fetchMock } = mockFetch(
      page(rowsFrom(0, 200), 'c1'),
      error(409, 'stale'),
      page(rowsFrom(0, 200), 'c1b'),
      page(rowsFrom(200, 3)),
    )

    const result = (await fetchWindow(1, 2_000_000_000))._unsafeUnwrap()

    expect(fetchMock).toHaveBeenCalledTimes(4)
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
