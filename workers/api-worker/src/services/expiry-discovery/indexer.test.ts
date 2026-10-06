import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchExpiringNamesPage, QUERY_PAGE_SIZE } from './indexer.js'
import { STAGES } from './stages.js'

const ENV = { CHAIN: 'sepolia' } as CloudflareBindings
const AS_OF = '1790755200'
const AS_OF_SEC = 1_790_755_200

const row = (name: string, expires_at: string, owner?: string) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0xabc',
  authority: 'ens_v2',
  registration_status: 'registered',
  expires_at,
  ...(owner !== undefined && { owner }),
})

const listing = (rows: unknown[]) => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: QUERY_PAGE_SIZE,
    total_count: null,
    has_more: false,
  },
  meta: {
    as_of: {
      '11155111': { block_number: 1, block_hash: '0x1', timestamp: AS_OF },
    },
  },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const stubFetch = (...responses: (Response | Error)[]) => {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next ?? json({}, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchExpiringNamesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('asks bigname for the window in its inclusive-exclusive terms and maps the rows', async () => {
    const fetchMock = stubFetch(
      json(listing([row('alpha.eth', '1700000000', '0xABC')])),
    )

    const result = await fetchExpiringNamesPage({
      env: ENV,
      stage: STAGES[0],
      cursor: 100,
      upperBound: 200,
    })

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe(
      `https://sepolia.api.bigname.sh/v1/names?namespace=ens&parent=eth&authority=ens_v2&expires_after=1970-01-01T00%3A01%3A41.000Z&expires_before=1970-01-01T00%3A03%3A21.000Z&sort=expires_at&order=asc&page_size=${QUERY_PAGE_SIZE}`,
    )
    expect(result._unsafeUnwrap()).toEqual({
      domains: [
        { name: 'alpha.eth', expiryDate: 1_700_000_000, owner: '0xabc' },
      ],
      hasMore: false,
      nextCursor: null,
      indexedAtSec: AS_OF_SEC,
    })
  })

  it('takes the owner from the lapsed registration once released', async () => {
    stubFetch(
      json(
        listing([
          {
            ...row('lapsed.eth', '1700000000'),
            registration_status: 'released',
            lapsed_registration: {
              owner: '0xDEF',
              released_at: '1702419200',
              release_kind: 'expired',
            },
          },
        ]),
      ),
    )

    const page = (
      await fetchExpiringNamesPage({
        env: ENV,
        stage: STAGES[0],
        cursor: 1,
        upperBound: 2,
      })
    )._unsafeUnwrap()

    expect(page.domains[0]).toEqual({
      name: 'lapsed.eth',
      expiryDate: 1_700_000_000,
      owner: '0xdef',
    })
  })

  it('leaves the owner unset when bigname knows none', async () => {
    stubFetch(json(listing([row('lapsed.eth', '1700000000')])))

    const page = (
      await fetchExpiringNamesPage({
        env: ENV,
        stage: STAGES[0],
        cursor: 1,
        upperBound: 2,
      })
    )._unsafeUnwrap()

    expect(page.domains[0]?.owner).toBeUndefined()
  })

  it('passes the page cursor on and returns the next one while bigname has more', async () => {
    const fetchMock = stubFetch(
      json({
        ...listing([row('alpha.eth', '1700000000')]),
        page: {
          cursor: 'c1',
          next_cursor: 'c2',
          page_size: QUERY_PAGE_SIZE,
          total_count: null,
          has_more: true,
        },
      }),
    )

    const page = (
      await fetchExpiringNamesPage({
        env: ENV,
        stage: STAGES[0],
        cursor: 1,
        upperBound: 2,
        pageCursor: 'c1',
      })
    )._unsafeUnwrap()

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(new URL(url).searchParams.get('cursor')).toBe('c1')
    expect(page.nextCursor).toBe('c2')
  })

  it('returns no next cursor on the last page', async () => {
    stubFetch(json(listing([row('alpha.eth', '1700000000')])))

    const page = (
      await fetchExpiringNamesPage({
        env: ENV,
        stage: STAGES[0],
        cursor: 1,
        upperBound: 2,
      })
    )._unsafeUnwrap()

    expect(page.nextCursor).toBeNull()
  })

  it('retries a transient failure and succeeds', async () => {
    const fetchMock = stubFetch(
      new TypeError('fetch failed'),
      json(listing([])),
    )

    const promise = fetchExpiringNamesPage({
      env: ENV,
      stage: STAGES[1],
      cursor: 1,
      upperBound: 2,
    })
    await vi.runAllTimersAsync()

    expect((await promise).isOk()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a request bigname rejected', async () => {
    const fetchMock = stubFetch(
      json(
        {
          error: { code: 'invalid_input', message: 'bad window', details: {} },
        },
        400,
      ),
    )

    const result = await fetchExpiringNamesPage({
      env: ENV,
      stage: STAGES[2],
      cursor: 1,
      upperBound: 2,
    })

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_REQUEST_ERROR')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails on a row without an expiry rather than skipping it', async () => {
    const { expires_at: _, ...bare } = row('bad.eth', '1700000000')
    stubFetch(json(listing([bare])))

    const result = await fetchExpiringNamesPage({
      env: ENV,
      stage: STAGES[0],
      cursor: 1,
      upperBound: 2,
    })

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('fails when the answer carries no chain position', async () => {
    stubFetch(json({ ...listing([]), meta: {} }))

    const result = await fetchExpiringNamesPage({
      env: ENV,
      stage: STAGES[0],
      cursor: 1,
      upperBound: 2,
    })

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('marks hasMore when the lookahead row is present', async () => {
    stubFetch(
      json(
        listing(
          Array.from({ length: QUERY_PAGE_SIZE }, (_, i) =>
            row(`${i}.eth`, String(1_700_000_000 + i)),
          ),
        ),
      ),
    )

    const page = (
      await fetchExpiringNamesPage({
        env: ENV,
        stage: STAGES[0],
        cursor: 1,
        upperBound: 2,
      })
    )._unsafeUnwrap()

    expect(page.hasMore).toBe(true)
  })
})
