import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAddressNames: vi.fn() }))

vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mocks.listAddressNames },
}))

import { getPrimaryNameCandidates } from './getPrimaryNameCandidates'

const ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01'

describe('getPrimaryNameCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the first 100 owned ENSv2 names by name, without released ones', async () => {
    mocks.listAddressNames.mockResolvedValue({
      data: [
        { name: 'alice.eth', registration_status: 'active', is_primary: true },
        {
          name: 'gone.eth',
          registration_status: 'released',
          is_primary: false,
        },
      ],
      page: {
        cursor: null,
        next_cursor: null,
        page_size: 2,
        total_count: 2,
        has_more: false,
      },
      meta: {},
    })

    const rows = await getPrimaryNameCandidates(ADDRESS)

    expect(rows.map((row) => row.name)).toEqual(['alice.eth'])
    expect(mocks.listAddressNames).toHaveBeenCalledWith(
      ADDRESS,
      {
        namespace: 'ens',
        relation: ['owner'],
        authority: 'ens_v2',
        sort: 'name',
        order: 'asc',
        page_size: 100,
      },
      { signal: undefined },
    )
  })
})
