import { createBignameIndexer } from '@ens-apps/indexer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/indexer', () => ({
  indexer: createBignameIndexer({
    baseUrl: 'https://bigname.test',
    chainId: 11155111,
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

// A served row; the indexer maps every field it reads.
const ALICE = {
  name: 'alice.eth',
  display_name: 'alice.eth',
  namehash: '0x01',
  authority: 'ens_v2',
  status: 'active',
  relations: ['owner'],
  is_primary: false,
}

const listing = (
  rows: readonly unknown[],
  page: { readonly total_count: number | null; readonly has_more: boolean },
) => ({
  data: rows,
  // bigname serves a next cursor whenever it has more.
  page: {
    cursor: null,
    next_cursor: page.has_more ? 'next' : null,
    page_size: 1,
    ...page,
  },
  meta: { as_of: {} },
})

describe('getOwnedNamesCount', () => {
  beforeEach(() => fetchMock.mockReset())

  it('counts owned .eth registrations once each, leaving subnames out', async () => {
    respond(listing([ALICE], { total_count: 3, has_more: true }))

    const result = await getOwnedNamesCount(
      '0x00000000000000000000000000000000000ABC',
    )

    expect(result._unsafeUnwrap()).toBe(3)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(
      '/v1/addresses/0x00000000000000000000000000000000000abc/names',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      namespace: 'ens',
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
    respond(listing([ALICE], { total_count: null, has_more: true }))

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
