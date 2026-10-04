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

  it('reads the exact registrant registration count from one row', async () => {
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
        relation: ['registrant'],
        dedupe: 'registration',
        page_size: 1,
      },
    )
  })

  it('returns an error when bigname fails', async () => {
    mocks.listAddressNames.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'busy' }),
    )

    expect((await getOwnedNamesCount(ADDRESS)).isErr()).toBe(true)
  })
})
