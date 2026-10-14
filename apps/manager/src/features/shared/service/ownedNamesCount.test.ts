import { createBignameClient } from '@ens-apps/indexer/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', () => ({
  bigname: createBignameClient('https://bigname.test', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetchMock(input, init),
  }),
}))

import { getOwnedNamesCount } from './ownedNamesCount'

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

describe('getOwnedNamesCount', () => {
  beforeEach(() => fetchMock.mockReset())

  it('counts owned .eth registrations once each, leaving subnames out', async () => {
    respond(
      listing([{ name: 'alice.eth' }], { total_count: 3, has_more: true }),
    )

    const result = await getOwnedNamesCount(
      '0x00000000000000000000000000000000000ABC',
    )

    expect(result._unsafeUnwrap()).toBe(3)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(
      '/v1/addresses/0x00000000000000000000000000000000000abc/names',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      relation: 'owner',
      parent: 'eth',
      dedupe: 'registration',
      include: 'total_count',
      page_size: '1',
    })
  })

  it('answers zero for an empty, complete listing without a total', async () => {
    respond(listing([], { total_count: null, has_more: false }))

    const result = await getOwnedNamesCount(
      '0x0000000000000000000000000000000000000abc',
    )

    expect(result._unsafeUnwrap()).toBe(0)
  })

  it('answers unknown when bigname gives no exact total', async () => {
    respond(
      listing([{ name: 'alice.eth' }], { total_count: null, has_more: true }),
    )

    const result = await getOwnedNamesCount(
      '0x0000000000000000000000000000000000000abc',
    )

    expect(result._unsafeUnwrap()).toBeNull()
  })

  it('wraps a failed read', async () => {
    respond({ error: { code: 'internal', message: 'down', details: {} } }, 500)

    const result = await getOwnedNamesCount(
      '0x0000000000000000000000000000000000000abc',
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetOwnedNamesCountError')
  })
})
