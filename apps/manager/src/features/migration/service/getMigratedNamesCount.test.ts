import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { bignamePage, bignameRequest, bignameResponse } from './_fixtures'
import { getMigratedNamesCount } from './getMigratedNamesCount'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/bigname')
  return {
    bigname: createBignameClient({
      baseUrl: 'https://bigname.test',
      fetch: fetchMock,
      retry: false,
    }),
  }
})

const ADDR = '0x0000000000000000000000000000000000000001'

beforeEach(() => {
  fetchMock.mockReset()
})

describe('getMigratedNamesCount', () => {
  it('returns the exact total_count of migrated names the address owns', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse(bignamePage([{}], { totalCount: 42 })),
    )
    const r = await getMigratedNamesCount(ADDR)
    assert(r.isOk())
    expect(r.value).toBe(42)
  })

  it('returns 0 for an empty page whose total_count is null', async () => {
    fetchMock.mockResolvedValueOnce(bignameResponse(bignamePage([])))
    const r = await getMigratedNamesCount(ADDR)
    assert(r.isOk())
    expect(r.value).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('asks for the exact count when a page with rows has a null total_count', async () => {
    fetchMock
      .mockResolvedValueOnce(
        bignameResponse(bignamePage([{}], { nextCursor: 'next' })),
      )
      .mockResolvedValueOnce(
        bignameResponse(
          bignamePage([{}], { nextCursor: 'next', totalCount: 1200 }),
        ),
      )
    const r = await getMigratedNamesCount(ADDR)
    assert(r.isOk())
    expect(r.value).toBe(1200)

    const { url } = bignameRequest(fetchMock.mock.calls[1])
    expect(Object.fromEntries(url.searchParams)).toEqual({
      relation: 'owner',
      is_migrated: 'true',
      dedupe: 'name',
      page_size: '1',
      include: 'total_count',
    })
  })

  it('returns null, not 0, when the exact count times out', async () => {
    fetchMock
      .mockResolvedValueOnce(
        bignameResponse(bignamePage([{}], { nextCursor: 'next' })),
      )
      .mockResolvedValueOnce(
        bignameResponse(
          {
            error: {
              code: 'request_timeout',
              message: 'request deadline exceeded',
              details: {},
            },
          },
          408,
        ),
      )
    const r = await getMigratedNamesCount(ADDR)
    assert(r.isOk())
    expect(r.value).toBeNull()
  })

  it('returns err when bigname fails', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse(
        { error: { code: 'internal_error', message: 'boom', details: {} } },
        500,
      ),
    )
    const r = await getMigratedNamesCount(ADDR)
    assert(r.isErr())
    expect(r.error._tag).toBe('GetMigratedNamesCountError')
  })

  it('asks for one owner row of proven migrations, deduped by name', async () => {
    fetchMock.mockResolvedValueOnce(
      bignameResponse(bignamePage([], { totalCount: 1 })),
    )
    await getMigratedNamesCount('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')

    const { url } = bignameRequest(fetchMock.mock.calls[0])
    expect(url.pathname).toBe(
      '/v1/addresses/0xabcdef0123456789abcdef0123456789abcdef01/names',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      relation: 'owner',
      is_migrated: 'true',
      dedupe: 'name',
      page_size: '1',
    })
  })
})
