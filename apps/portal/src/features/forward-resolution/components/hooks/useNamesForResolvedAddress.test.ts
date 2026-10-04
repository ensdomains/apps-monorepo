import type { AddressNameRow } from '@ens-apps/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ADDRESS = '0x1111111111111111111111111111111111111111'

const mockListAddressNames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mockListAddressNames },
}))

const { getResolvedNamesForAddress } = await import(
  './useNamesForResolvedAddress'
)

const row = (
  name: string,
  resolutions: AddressNameRow['resolutions'],
): AddressNameRow => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x00',
  registration_status: 'registered',
  relations: ['resolves_to'],
  is_primary: false,
  resolutions,
})

describe('getResolvedNamesForAddress', () => {
  beforeEach(() => {
    mockListAddressNames.mockReset()
  })

  it('lists names resolving to the address on any EVM chain, with the matched coin types', async () => {
    mockListAddressNames.mockResolvedValue({
      data: [
        row('a.eth', [
          { coin_type: 60, record_key: 'addr:60' },
          { coin_type: 2147492101, record_key: 'addr:2147492101' },
        ]),
        row('b.eth', [
          { coin_type: 2147483648, record_key: 'addr:2147483648' },
        ]),
      ],
      page: {
        cursor: null,
        next_cursor: null,
        page_size: 200,
        total_count: null,
        has_more: false,
      },
      meta: {},
    })

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([
      { name: 'a.eth', coinTypes: ['60', '2147492101'] },
      { name: 'b.eth', coinTypes: ['2147483648'] },
    ])
    expect(mockListAddressNames).toHaveBeenCalledWith(ADDRESS, {
      namespace: 'ens',
      relation: 'resolves_to',
      coin_type: 'evm',
      sort: 'name',
      page_size: 200,
      cursor: undefined,
    })
  })
})
