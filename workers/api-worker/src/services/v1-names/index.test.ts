import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasV1Names } from './index'

const ADDRESS = '0xC0794B670346025738EE90D470862BF76727BCF3'
const ENV = { CHAIN: 'sepolia' } as CloudflareBindings

const FUTURE = '1861920000'
const PAST = '1577836800'

const row = (name: string, expires_at?: string) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0xabc',
  status: 'active',
  relations: ['owner'],
  is_primary: false,
  ...(expires_at !== undefined && { expires_at }),
})

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const mockBigname = (...bodies: readonly unknown[]) => {
  const fetchMock = vi.fn()
  for (const body of bodies) fetchMock.mockResolvedValueOnce(respond(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const page = (rows: unknown[], nextCursor: string | null = null) => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: 200,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: { as_of: {} },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasV1Names', () => {
  it('asks bigname for the v1 names of the lowercased address, latest expiry first', async () => {
    const fetchMock = mockBigname(page([]))

    await hasV1Names(ADDRESS, ENV)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      `https://sepolia.api.bigname.sh/v1/addresses/${ADDRESS.toLowerCase()}/names?relation=any&authority=ens_v1%2Cens_v0&sort=expires_at&order=desc&page_size=200`,
    )
  })

  it('is true when the latest-expiring name is still live', async () => {
    mockBigname(page([row('alice.eth', FUTURE), row('bob.eth', PAST)]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(true)
  })

  it('is true when the address holds a name that never expires', async () => {
    mockBigname(page([row('sub.alice.eth'), row('bob.eth', PAST)]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(true)
  })

  it('is false for a name in grace, which the migration rejects', async () => {
    mockBigname(page([{ ...row('alice.eth', PAST), grace_ends_at: FUTURE }]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it.each([
    { label: 'false once its lease has lapsed', lease: PAST, expected: false },
    { label: 'true while its lease is live', lease: FUTURE, expected: true },
  ])('judges a reserved name by its lease: $label', async ({
    lease,
    expected,
  }) => {
    mockBigname(
      page([{ ...row('reserved.eth', FUTURE), ens_v1: { expires_at: lease } }]),
    )

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(expected)
  })

  it('looks past an expired first row to a later live name', async () => {
    mockBigname(page([row('alice.eth', PAST), row('sub.alice.eth')]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(true)
  })

  it('walks every page before answering no', async () => {
    const fetchMock = mockBigname(
      page([row('alice.eth', PAST)], 'next'),
      page([row('bob.eth', FUTURE)]),
    )

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [secondUrl] = fetchMock.mock.calls[1] as [string]
    expect(new URL(secondUrl).searchParams.get('cursor')).toBe('next')
  })

  it.each([
    'expired',
    'released',
    'unregistered',
  ])('does not count a %s name', async (status) => {
    mockBigname(page([{ ...row('gone.eth', FUTURE), status }]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('is true for a wrapped name that never expires', async () => {
    mockBigname(page([row('passkey.eth', '18446744073709551615')]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(true)
  })

  it('is false when every name has lapsed', async () => {
    mockBigname(page([row('alice.eth', PAST), row('bob.eth', PAST)]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('is false when the address holds no v1 names', async () => {
    mockBigname(page([]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('does not count a released name, even without an expiry', async () => {
    mockBigname(
      page([
        { ...row('gone.eth'), status: 'released' },
        row('alice.eth', PAST),
      ]),
    )

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it.each([
    'abc.addr.reverse',
    'abc.default.reverse',
    'abc.80002105.reverse',
  ])('does not count the reverse record %s', async (name) => {
    mockBigname(page([row(name), row('alice.eth', PAST)]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('throws on a failed response, so the caller stays fail-closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond(
            { error: { code: 'overloaded', message: 'busy', details: {} } },
            503,
          ),
        ),
    )

    await expect(hasV1Names(ADDRESS, ENV)).rejects.toMatchObject({
      code: 'overloaded',
    })
  })
})
