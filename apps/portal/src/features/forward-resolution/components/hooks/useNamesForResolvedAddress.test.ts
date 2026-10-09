import {
  type AddressName,
  BignameError,
  type LookupRecord,
} from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getResolvedNamesForAddress } from './useNamesForResolvedAddress'

vi.mock('@/lib/bigname', () => ({
  bigname: { addressNames: vi.fn(), lookup: vi.fn() },
}))

const ADDRESS = '0x996695a9072094d29f93aebd4229e3d5fb6bf231'

const row = (name: string, coinTypes: readonly number[]): AddressName => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x01',
  status: 'active',
  relations: ['resolves_to'],
  is_primary: false,
  resolutions: coinTypes.map((coin_type) => ({
    coin_type,
    record_key: `addr:${coin_type}`,
  })),
})

const detail = (
  name: string,
  addresses: Readonly<Record<string, string | null>>,
): LookupRecord => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x01',
  read_status: 'ok',
  records: {
    seen_addresses: Object.keys(addresses),
    addresses,
    seen_texts: [],
    texts: {},
    abis: {},
    seen_singletons: [],
  },
})

const listed = (rows: readonly AddressName[]) =>
  vi
    .mocked(bigname.addressNames)
    .mockReturnValue(okAsync({ data: rows, meta: { as_of: {} } }))

const detailed = (records: readonly LookupRecord[]) =>
  vi.mocked(bigname.lookup).mockReturnValue(
    okAsync({
      data: records.map((record) => ({
        input: { name: record.name },
        kind: 'name' as const,
        status: 'ok' as const,
        record,
      })),
      meta: { as_of: {} },
    }),
  )

beforeEach(() => vi.clearAllMocks())

describe('getResolvedNamesForAddress', () => {
  it('asks bigname for the names whose EVM address records hold the address', async () => {
    listed([row('juveniles.eth', [60])])
    detailed([detail('juveniles.eth', { '60': ADDRESS })])

    await getResolvedNamesForAddress({ address: ADDRESS })

    expect(bigname.addressNames).toHaveBeenCalledWith(ADDRESS, {
      namespace: 'ens',
      relation: 'resolves_to',
      coin_type: 'evm',
      sort: 'name',
      order: 'asc',
      page_size: 100,
    })
  })

  it('lists each name with the networks it has an address for, cleared ones excluded', async () => {
    listed([row('juveniles.eth', [2147483658])])
    detailed([
      detail('juveniles.eth', {
        '60': '0xabc',
        '0': 'bc1q',
        '2147483658': ADDRESS,
        '501': null,
      }),
    ])

    const names = (
      await getResolvedNamesForAddress({ address: ADDRESS })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual(['juveniles.eth'])
    expect(names[0]?.coinTypes.toSorted()).toEqual(['0', '2147483658', '60'])
  })

  it('says when more names point at the address than bigname lists', async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      errAsync(new BignameError({ code: 'unsupported', message: 'too many' })),
    )

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrapErr()._tag).toBe('TooManyResolvedNamesError')
  })

  it('is empty without a lookup when no name points at the address', async () => {
    listed([])

    const names = (
      await getResolvedNamesForAddress({ address: ADDRESS })
    )._unsafeUnwrap()

    expect(names).toEqual([])
    expect(bigname.lookup).not.toHaveBeenCalled()
  })
})
