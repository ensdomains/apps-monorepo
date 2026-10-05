import { BignameError } from '@ens-apps/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAddressNames: vi.fn() }))

vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mocks.listAddressNames },
}))

import { getOwnedNamesCount } from './ownedNamesCount'

const ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'

describe('getOwnedNamesCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the exact .eth registration count of the token holder from one row', async () => {
    mocks.listAddressNames.mockResolvedValue({
      data: [],
      page: {
        cursor: null,
        next_cursor: 'next',
        page_size: 1,
        total_count: 7,
        has_more: true,
      },
      meta: {},
    })

    expect((await getOwnedNamesCount(ADDRESS))._unsafeUnwrap()).toBe(7)
    expect(mocks.listAddressNames).toHaveBeenCalledExactlyOnceWith(
      ADDRESS.toLowerCase(),
      {
        namespace: 'ens',
        relation: 'owner',
        parent: 'eth',
        dedupe: 'registration',
        page_size: 1,
      },
      {},
    )
  })

  it('asks for the exact count when bigname leaves it null above its candidate cap', async () => {
    const page = (total_count: number | null) => ({
      data: [{ name: 'alice.eth' }],
      page: {
        cursor: null,
        next_cursor: 'next',
        page_size: 1,
        total_count,
        has_more: true,
      },
      meta: {},
    })
    mocks.listAddressNames
      .mockResolvedValueOnce(page(null))
      .mockResolvedValueOnce(page(1500))

    expect((await getOwnedNamesCount(ADDRESS))._unsafeUnwrap()).toBe(1500)
    expect(mocks.listAddressNames).toHaveBeenLastCalledWith(
      ADDRESS.toLowerCase(),
      expect.objectContaining({ page_size: 1, include: ['total_count'] }),
      expect.anything(),
    )
  })

  it('returns null, not zero, when the exact count times out', async () => {
    mocks.listAddressNames
      .mockResolvedValueOnce({
        data: [{ name: 'alice.eth' }],
        page: {
          cursor: null,
          next_cursor: 'next',
          page_size: 1,
          total_count: null,
          has_more: true,
        },
        meta: {},
      })
      .mockRejectedValueOnce(
        new BignameError({
          status: 408,
          code: 'request_timeout',
          message: 'request deadline exceeded',
        }),
      )

    expect((await getOwnedNamesCount(ADDRESS))._unsafeUnwrap()).toBeNull()
  })

  it('returns an error when bigname fails', async () => {
    mocks.listAddressNames.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'busy' }),
    )

    expect((await getOwnedNamesCount(ADDRESS)).isErr()).toBe(true)
  })
})
