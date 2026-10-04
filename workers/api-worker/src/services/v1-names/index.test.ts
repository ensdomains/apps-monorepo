import { isBignameError } from '@ens-apps/bigname'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import { hasV1Names } from './index'

const ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01'
const DAY = 86_400
const nowSec = () => Math.floor(Date.now() / 1000)
const future = () => String(nowSec() + 30 * DAY)
const past = () => String(nowSec() - DAY)

type Row = {
  name: string
  expires_at?: string | null
  registration_status?: string
  authority?: string
  ens_v1?: { expires_at?: string | null }
}

const row = (overrides: Row) => ({
  display_name: overrides.name,
  namespace: 'ens',
  namehash: `0x${'0'.repeat(64)}`,
  relations: ['owner'],
  is_primary: false,
  registration_status: 'active',
  authority: 'ens_v1',
  ...overrides,
})

const page = (rows: Row[], nextCursor: string | null = null) =>
  new Response(
    JSON.stringify({
      data: rows.map(row),
      page: {
        cursor: null,
        next_cursor: nextCursor,
        page_size: 200,
        total_count: rows.length,
        has_more: nextCursor !== null,
      },
      meta: {},
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasV1Names', () => {
  it('returns true for a live ENSv1 name from one walk over both authorities', async () => {
    const { fetchMock, url } = mockFetch(
      page([{ name: 'alpha.eth', expires_at: future() }]),
    )

    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = url(0)
    expect(request.origin).toBe('https://sepolia.api.bigname.sh')
    expect(request.pathname).toBe(`/v1/addresses/${ADDRESS}/names`)
    expect(Object.fromEntries(request.searchParams)).toEqual({
      relation: 'any',
      authority: 'ens_v1,ens_v0',
      sort: 'expires_at',
      order: 'desc',
      page_size: '200',
    })
  })

  it('counts names still on the 2017 registry (ens_v0)', async () => {
    mockFetch(
      page([{ name: 'legacy.eth', authority: 'ens_v0', expires_at: future() }]),
    )
    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(true)
  })

  it('returns false when the walk lists no name', async () => {
    const { fetchMock } = mockFetch(page([]))
    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('counts a name without an expiry as live', async () => {
    mockFetch(
      page([
        {
          name: 'sub.alpha.eth',
          registration_status: 'wrapped',
          expires_at: null,
          ens_v1: { expires_at: null },
        },
      ]),
    )
    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(true)
  })

  it('judges a reserved lease by its own date, not the reservation', async () => {
    mockFetch(
      // Lease ended yesterday; the ENSv2 reservation runs 61 more days.
      page([
        {
          name: 'reserved.eth',
          registration_status: 'wrapped',
          expires_at: String(nowSec() + 61 * DAY),
          ens_v1: { expires_at: past() },
        },
      ]),
    )
    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(false)
  })

  it('ignores reverse records, released, ownerless and expired names', async () => {
    mockFetch(
      page([
        { name: `${ADDRESS.slice(2)}.addr.reverse` },
        {
          name: 'released.eth',
          registration_status: 'released',
          expires_at: future(),
        },
        { name: 'husk.eth', registration_status: 'unregistered' },
        { name: 'expired.eth', expires_at: past() },
      ]),
      page([]),
    )
    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(false)
  })

  it('follows the cursor while rows are unexpired but not migratable', async () => {
    const { fetchMock, url } = mockFetch(
      page([{ name: `${ADDRESS.slice(2)}.addr.reverse` }], 'next-1'),
      page([{ name: 'alpha.eth', expires_at: future() }]),
    )

    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(url(1).searchParams.get('cursor')).toBe('next-1')
    expect(url(1).searchParams.get('order')).toBe('desc')
  })

  it('stops at the first lapsed expiry and reads expiry-less rows from the ascending end', async () => {
    const { fetchMock, url } = mockFetch(
      page([{ name: 'expired.eth', expires_at: past() }], 'next-1'),
      page([
        {
          name: 'sub.alpha.eth',
          registration_status: 'wrapped',
          expires_at: null,
        },
      ]),
    )

    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(true)

    // The descending continuation is skipped; the second call starts over ascending.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(url(1).searchParams.get('order')).toBe('asc')
    expect(url(1).searchParams.has('cursor')).toBe(false)
  })

  it('stops the ascending walk at the first row with an expiry', async () => {
    const { fetchMock } = mockFetch(
      page([{ name: 'expired.eth', expires_at: past() }], 'next-1'),
      page(
        [
          { name: 'husk.alpha.eth', registration_status: 'unregistered' },
          { name: 'old.eth', expires_at: past() },
        ],
        'next-2',
      ),
    )

    await expect(hasV1Names(makeMockEnv(), ADDRESS)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on a failed read (fail-closed for callers)', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: { code: 'internal_error', message: 'boom', details: {} },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    )

    const error = await hasV1Names(makeMockEnv(), ADDRESS).catch((e) => e)
    expect(isBignameError(error, 'internal_error')).toBe(true)
  })
})
