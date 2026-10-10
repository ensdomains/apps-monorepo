import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ExpiringNamesQuery,
  fetchExpiringNamesPage,
  fetchIndexedAtSec,
  fetchIndexReadiness,
  MAX_INDEX_STALENESS_SECONDS,
  PAGE_SIZE,
} from './indexer.js'

import { fetchSweep } from './page.js'
import { STAGES } from './stages.js'

const ENV = { CHAIN: 'sepolia' } as CloudflareBindings
const AS_OF = '1790755200'
const AS_OF_SEC = 1_790_755_200

const QUERY: ExpiringNamesQuery = {
  env: ENV,
  label: 'a test read',
  windows: [{ from: 101, to: 200 }],
}

const DAY = 86_400
const graceAfter = (expires_at: string, days: number) =>
  String(Number(expires_at) + days * DAY)

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
  status: 'active',
  expires_at,
  grace_ends_at: graceAfter(expires_at, 28),
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
    expect(params.getAll('expires_window')).toEqual(['101..201'])
    expect(params.get('expires_after')).toBeNull()
    expect(params.get('sort')).toBe('expires_at')
    expect(params.get('page_size')).toBe(String(PAGE_SIZE))
    expect(params.get('authority')).toBeNull()
    expect(params.get('cursor')).toBeNull()
  })

  it('sends each window as its own parameter and passes the page cursor on', async () => {
    const fetchMock = stubFetch(json(listing([])))

    await fetchExpiringNamesPage({
      ...QUERY,
      windows: [
        { from: 101, to: 200 },
        { from: 301, to: 400 },
      ],
      pageCursor: 'c1',
    })

    const params = requestedParams(fetchMock)
    expect(params.getAll('expires_window')).toEqual(['101..201', '301..401'])
    expect(params.get('cursor')).toBe('c1')
  })

  it('maps rows to their served expiry, status and owner', async () => {
    stubFetch(
      json(
        listing([
          row('v2.eth', '1700000000', { owner: '0xABC' }),
          row('v1.eth', '1700000001', {
            authority: 'ens_v1',
            status: 'active',
            owner: '0xDEF',
          }),
        ]),
      ),
    )

    const page = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(page).toEqual({
      names: [
        {
          name: 'v2.eth',
          expiryDate: 1_700_000_000,
          registrationStatus: 'active',
          hasV2Grace: true,
          owner: '0xabc',
        },
        {
          name: 'v1.eth',
          expiryDate: 1_700_000_001,
          registrationStatus: 'active',
          hasV2Grace: true,
          owner: '0xdef',
        },
      ],
      nextCursor: null,
      indexedAtSec: AS_OF_SEC,
    })
  })

  it('marks a lease still on the 90-day ENSv1 grace as off the 28-day track', async () => {
    stubFetch(
      json(
        listing([
          row('unreserved.eth', '1700000000', {
            authority: 'ens_v1',
            grace_ends_at: graceAfter('1700000000', 90),
          }),
          row('no-grace.eth', '1700000001', { grace_ends_at: undefined }),
        ]),
      ),
    )

    const page = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(page.names.map(({ hasV2Grace }) => hasV2Grace)).toEqual([
      false,
      false,
    ])
  })

  it('takes the owner from the lapsed registration once released', async () => {
    stubFetch(
      json(
        listing([
          row('lapsed.eth', '1700000000', {
            status: 'released',
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

    expect(page.names[0]).toEqual(
      expect.objectContaining({
        registrationStatus: 'released',
        releaseKind: 'expired',
        owner: '0xdef',
      }),
    )
  })

  it.each([
    { stageId: 'expiry-1d', status: 'active', offsetDays: 1 },
    { stageId: 'grace-start', status: 'expired', offsetDays: 0 },
    { stageId: 'grace-7d', status: 'expired', offsetDays: -21 },
    { stageId: 'grace-1d', status: 'expired', offsetDays: -27 },
    { stageId: 'premium-start', status: 'released', offsetDays: -28 },
  ])('sweeps a v0.7 reservation through $stageId', async ({
    stageId,
    status,
    offsetDays,
  }) => {
    const stage = STAGES.find((candidate) => candidate.id === stageId)
    if (!stage) throw new Error('Missing stage')
    const expiry = AS_OF_SEC + offsetDays * DAY
    stubFetch(
      json(
        listing([
          row('reserved.eth', String(expiry), {
            authority: 'ens_v1',
            status,
            ens_v1: { expires_at: String(expiry - 62 * DAY) },
            // The lease can lapse before the canonical reservation does.
            lapsed_registration: { owner: '0xDEF', release_kind: 'expired' },
          }),
        ]),
      ),
    )
    const sweep = (
      await fetchSweep({
        env: ENV,
        windows: [{ stage, cursor: expiry - 1, upperBound: expiry }],
      })
    )._unsafeUnwrap()
    expect(sweep.pages.get(stage.id)?.domains).toEqual([
      expect.objectContaining({
        name: 'reserved.eth',
        expiryDate: expiry,
        owner: '0xdef',
      }),
    ])
  })

  it.each([
    undefined,
    'wrapped',
    'unexpected',
  ])('rejects an invalid lifecycle status %s', async (status) => {
    stubFetch(json(listing([row('bad.eth', '1700000000', { status })])))
    const result = await fetchExpiringNamesPage(QUERY)
    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
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

  it('retries a stale page with the same cursor', async () => {
    const fetchMock = stubFetch(
      json({ error: { code: 'stale', message: 'retry', details: {} } }, 409),
      json(listing([])),
    )

    const promise = fetchExpiringNamesPage({ ...QUERY, pageCursor: 'next' })
    await vi.runAllTimersAsync()

    expect((await promise).isOk()).toBe(true)
    expect(
      fetchMock.mock.calls.map(([input]) =>
        new URL(String(input)).searchParams.get('cursor'),
      ),
    ).toEqual(['next', 'next'])
  })

  it('dates a reserved ENSv1 name by its served reservation expiry', async () => {
    stubFetch(
      json(
        listing([
          row('reserved.eth', '1705356801', {
            authority: 'ens_v1',
            ens_v1: { expires_at: '1700000000' },
          }),
        ]),
      ),
    )

    const page = (await fetchExpiringNamesPage(QUERY))._unsafeUnwrap()

    expect(page.names[0]?.expiryDate).toBe(1_705_356_801)
  })

  it('probes the index position with a one-second window', async () => {
    const fetchMock = stubFetch(json(listing([])))

    const indexedAt = await fetchIndexedAtSec(ENV, 1_700_000_000)

    expect(indexedAt._unsafeUnwrap()).toBe(AS_OF_SEC)
    const params = requestedParams(fetchMock)
    expect(params.getAll('expires_window')).toEqual(['1700000000..1700000001'])
  })
})

const chainStatus = (overrides: Readonly<Record<string, unknown>> = {}) =>
  json({
    data: {
      status: 'ready',
      pending_invalidation_count: 0,
      pending_invalidation_count_capped: false,
      dead_letter_count: 0,
      chains: {
        '11155111': {
          lag_seconds: 0,
          ingestion_lag_seconds: 12,
          status: 'ready',
          ...overrides,
        },
      },
    },
    meta: {},
  })

describe('fetchIndexReadiness', () => {
  it.each([
    { case: 'a current index', overrides: {}, isReady: true },
    {
      case: 'lag at the limit',
      overrides: {
        lag_seconds: 60,
        ingestion_lag_seconds: MAX_INDEX_STALENESS_SECONDS - 60,
      },
      isReady: true,
    },
    {
      case: 'lag past the limit',
      overrides: { ingestion_lag_seconds: MAX_INDEX_STALENESS_SECONDS + 1 },
      isReady: false,
    },
    {
      case: 'a redo in progress',
      overrides: { lag_seconds: null },
      isReady: false,
    },
    {
      case: 'unknown ingestion lag',
      overrides: { ingestion_lag_seconds: null },
      isReady: false,
    },
  ])('$case is ready: $isReady', async ({ overrides, isReady }) => {
    stubFetch(chainStatus(overrides))

    const readiness = await fetchIndexReadiness(ENV)

    expect(readiness._unsafeUnwrap().isReady).toBe(isReady)
  })

  it('is not ready for a chain bigname does not serve', async () => {
    stubFetch(
      json({
        data: {
          status: 'ready',
          pending_invalidation_count: 0,
          pending_invalidation_count_capped: false,
          dead_letter_count: 0,
          chains: {},
        },
        meta: {},
      }),
    )

    expect((await fetchIndexReadiness(ENV))._unsafeUnwrap().isReady).toBe(false)
  })
})
