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
  registration_status: 'wrapped',
  relations: ['owner'],
  is_primary: false,
  ...(expires_at !== undefined && { expires_at }),
})

const mockBigname = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const page = (rows: unknown[]) => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 10,
    total_count: rows.length,
    has_more: false,
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
      `https://sepolia.api.bigname.sh/v1/addresses/${ADDRESS.toLowerCase()}/names?relation=any&authority=ens_v1&sort=expires_at&order=desc&page_size=10`,
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
        { ...row('gone.eth'), registration_status: 'released' },
        row('alice.eth', PAST),
      ]),
    )

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('does not count a reverse record', async () => {
    mockBigname(page([row('abc.addr.reverse'), row('alice.eth', PAST)]))

    await expect(hasV1Names(ADDRESS, ENV)).resolves.toBe(false)
  })

  it('throws on a failed response, so the caller stays fail-closed', async () => {
    mockBigname(
      { error: { code: 'overloaded', message: 'busy', details: {} } },
      503,
    )

    await expect(hasV1Names(ADDRESS, ENV)).rejects.toMatchObject({
      code: 'overloaded',
    })
  })
})
