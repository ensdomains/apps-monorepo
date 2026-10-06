import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ExpiringNamesQuery,
  fetchExpiringNamesPage,
  isStaleCursorError,
  PAGE_SIZE,
} from './indexer.js'

const ENV = { CHAIN: 'sepolia' } as CloudflareBindings
const AS_OF = '1790755200'
const AS_OF_SEC = 1_790_755_200

const QUERY: ExpiringNamesQuery = {
  env: ENV,
  stageId: 'expiry-30d',
  expiresFrom: 101,
  expiresTo: 200,
}

const row = (
  name: string,
  expires_at: string,
  extra: Readonly<Record<string, unknown>> = {},
) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0xabc',
  authority: 'ens_v2',
  registration_status: 'registered',
  expires_at,
  ...extra,
})

const listing = (
  rows: readonly unknown[],
  page: Readonly<Record<string, unknown>> = {},
) => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: PAGE_SIZE,
    total_count: null,
    has_more: false,
    ...page,
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

const stubFetch = (...responses: readonly (Response | Error)[]) => {
  let call = 0
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
    const next = responses[call++]
    if (next instanceof Error) throw next
    return next ?? json({}, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const requestedParams = (
  fetchMock: ReturnType<typeof stubFetch>,
): URLSearchParams => new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams

describe('fetchExpiringNamesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('asks for .eth names with inclusive bounds on both ends', async () => {
    const fetchMock = stubFetch(json(listing([])))

    await fetchExpiringNamesPage(QUERY)

    const params = requestedParams(fetchMock)
    expect(params.get('namespace')).toBe('ens')
    expect(params.get('parent')).toBe('eth')
    expect(params.get('expires_after')).toBe('1970-01-01T00:01:41.000Z')
    expect(params.get('expires_before')).toBe('1970-01-01T00:03:21.000Z')
    expect(params.get('sort')).toBe('expires_at')
    expect(params.get('page_size')).toBe(String(PAGE_SIZE))
    expect(params.get('authority')).toBeNull()
    expect(params.get('cursor')).toBeNull()
  })

  it('narrows to the given authorities and passes the page cursor on', async () => {
    const fetchMock = stubFetch(json(listing([])))

    await fetchExpiringNamesPage({
      ...QUERY,
      authorities: ['ens_v0', 'ens_v1'],
      pageCursor: 'c1',
    })

    const params = requestedParams(fetchMock)
    expect(params.get('authority')).toBe('ens_v0,ens_v1')
    expect(params.get('cursor')).toBe('c1')
  })

  it('maps rows to their registrar expiry, protocol and owner', async () => {
    stubFetch(
      json(
        listing([
          row('v2.eth', '1700000000', { owner: '0xABC' }),
          row('v1.eth', '1700000001', { authority: 'ens_v1', owner: '0xDEF' }),
          row('v0.eth', '1700000002', { authority: 'ens_v0' }),
        ]),
      ),
    )

    const page = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(page).toEqual({
      names: [
        {
          name: 'v2.eth',
          expiryDate: 1_700_000_000,
          protocol: 'v2',
          owner: '0xabc',
        },
        {
          name: 'v1.eth',
          expiryDate: 1_700_000_001,
          protocol: 'v1',
          owner: '0xdef',
        },
        {
          name: 'v0.eth',
          expiryDate: 1_700_000_002,
          protocol: 'v1',
          owner: undefined,
        },
      ],
      nextCursor: null,
      indexedAtSec: AS_OF_SEC,
    })
  })

  it('takes the owner from the lapsed registration once released', async () => {
    stubFetch(
      json(
        listing([
          row('lapsed.eth', '1700000000', {
            registration_status: 'released',
            lapsed_registration: {
              owner: '0xDEF',
              released_at: '1702419200',
              release_kind: 'expired',
            },
          }),
        ]),
      ),
    )

    const page = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(page.names[0]?.owner).toBe('0xdef')
  })

  it('returns the next cursor only while bigname has more', async () => {
    stubFetch(
      json(
        listing([row('a.eth', '1700000000')], {
          next_cursor: 'c2',
          has_more: true,
        }),
      ),
      json(
        listing([row('b.eth', '1700000001')], {
          next_cursor: 'c3',
          has_more: false,
        }),
      ),
    )

    const first = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()
    const last = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(first.nextCursor).toBe('c2')
    expect(last.nextCursor).toBeNull()
  })

  it.each([
    ['without an expiry', { expires_at: undefined }],
    ['with an unreadable expiry', { expires_at: 'soon' }],
    ['without an authority', { authority: undefined }],
  ])('fails on a row %s rather than skipping it', async (_label, extra) => {
    stubFetch(json(listing([row('bad.eth', '1700000000', extra)])))

    const result = await fetchExpiringNamesPage(QUERY)

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('fails when the answer carries no chain position', async () => {
    stubFetch(json({ ...listing([]), meta: {} }))

    const result = await fetchExpiringNamesPage(QUERY)

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('retries a transient failure and succeeds', async () => {
    const fetchMock = stubFetch(
      new TypeError('fetch failed'),
      json(listing([])),
    )

    const promise = fetchExpiringNamesPage(QUERY)
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

    const result = await fetchExpiringNamesPage(QUERY)

    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_REQUEST_ERROR')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { code: 'stale', status: 409, isStale: true },
    { code: 'invalid_input', status: 400, isStale: false },
  ])('recognises a $code rejection as stale: $isStale', async ({
    code,
    status,
    isStale,
  }) => {
    stubFetch(
      json({ error: { code, message: 'rejected', details: {} } }, status),
    )

    const result = await fetchExpiringNamesPage({ ...QUERY, pageCursor: 'old' })

    expect(isStaleCursorError(result._unsafeUnwrapErr())).toBe(isStale)
  })
})
