import { createBignameClient } from '@ens-apps/indexer/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', () => ({
  bigname: createBignameClient('https://bigname.test', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetchMock(input, init),
  }),
}))

import { getMigratedNamesCount } from './getMigratedNamesCount'

const ADDR = '0x0000000000000000000000000000000000000001'

const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const listing = (
  rows: readonly unknown[],
  page: { readonly total_count: number | null; readonly has_more: boolean },
) => ({
  data: rows,
  page: { cursor: null, next_cursor: null, page_size: 1, ...page },
  meta: { as_of: {} },
})

describe('getMigratedNamesCount', () => {
  beforeEach(() => fetchMock.mockReset())

  it('asks for the exact count of owned names that moved from ENSv1', async () => {
    respond(
      listing([{ name: 'alice.eth' }], { total_count: 4, has_more: true }),
    )

    const result = await getMigratedNamesCount(ADDR)

    expect(result._unsafeUnwrap()).toBe(4)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      relation: 'owner',
      is_migrated: 'true',
      dedupe: 'name',
      include: 'total_count',
      page_size: '1',
    })
  })

  it.each([
    [0, []],
    [1, [{ name: 'alice.eth' }]],
  ])('counts the rows of a complete listing without a total: %i', async (expected, rows) => {
    respond(listing(rows, { total_count: null, has_more: false }))

    const result = await getMigratedNamesCount(ADDR)

    expect(result._unsafeUnwrap()).toBe(expected)
  })

  it('fails rather than guess when there is more and no total', async () => {
    respond(
      listing([{ name: 'alice.eth' }], { total_count: null, has_more: true }),
    )

    const result = await getMigratedNamesCount(ADDR)

    expect(result._unsafeUnwrapErr()._tag).toBe('GetMigratedNamesCountError')
  })

  it('fails on a bigname error', async () => {
    respond({ error: { code: 'internal', message: 'down', details: {} } }, 500)

    const result = await getMigratedNamesCount(ADDR)

    expect(result._unsafeUnwrapErr()._tag).toBe('GetMigratedNamesCountError')
  })
})
