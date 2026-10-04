import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAddressNames: vi.fn() }))

vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mocks.listAddressNames },
}))

import { hasOwnedNames } from './hasOwnedNames'

const ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'

/** A registry child bigname lists under `owner` without a name row. */
const registryChild = {
  name: 'sub002.leon.eth',
  registration_status: 'unregistered',
}
const held = { name: 'leon002.eth', registration_status: 'active' }

const page = (rows: readonly unknown[], nextCursor: string | null = null) => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: 50,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: {},
})

describe('hasOwnedNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the owner relation and is true on the first listed row', async () => {
    mocks.listAddressNames.mockResolvedValueOnce(page([registryChild, held]))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(true)
    expect(mocks.listAddressNames).toHaveBeenCalledExactlyOnceWith(
      ADDRESS.toLowerCase(),
      {
        namespace: 'ens',
        relation: 'owner',
        page_size: 50,
        cursor: undefined,
      },
      { signal: undefined },
    )
  })

  it('does not count registry children without a name row', async () => {
    mocks.listAddressNames
      .mockResolvedValueOnce(page([registryChild], 'next'))
      .mockResolvedValueOnce(page([registryChild]))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(false)
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(2)
  })

  it('keeps reading past a page of registry children', async () => {
    mocks.listAddressNames
      .mockResolvedValueOnce(page([registryChild], 'next'))
      .mockResolvedValueOnce(page([held]))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(true)
  })

  it('is false for an address with no names', async () => {
    mocks.listAddressNames.mockResolvedValueOnce(page([]))

    await expect(hasOwnedNames(ADDRESS)).resolves.toBe(false)
  })
})
