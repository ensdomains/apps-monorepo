import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAddressNames: vi.fn() }))

vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mocks.listAddressNames },
}))

import { hasOwnedNames } from './hasOwnedNames'

const ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'

const page = (totalCount: number | null, rows: number) => ({
  data: Array.from({ length: rows }, () => ({})),
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 1,
    total_count: totalCount,
    has_more: false,
  },
  meta: {},
})

describe('hasOwnedNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads one owner row and the exact total', async () => {
    mocks.listAddressNames.mockResolvedValue(page(3, 1))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(true)
    expect(mocks.listAddressNames).toHaveBeenCalledWith(
      ADDRESS.toLowerCase(),
      { namespace: 'ens', relation: ['owner'], page_size: 1 },
      { signal: undefined },
    )
  })

  it('is false for an address with no names', async () => {
    mocks.listAddressNames.mockResolvedValue(page(0, 0))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(false)
  })
})
