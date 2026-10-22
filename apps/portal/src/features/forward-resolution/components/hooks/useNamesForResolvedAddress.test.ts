import {
  type AddressName,
  BignameError,
  type LookupRecord,
} from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getResolvedNamesPage } from './useNamesForResolvedAddress'

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

const listed = (rows: readonly AddressName[], next: string | null = null) =>
  vi.mocked(bigname.addressNames).mockReturnValue(
    okAsync({
      data: rows,
      page: {
        cursor: null,
        next_cursor: next,
        page_size: 100,
        total_count: null,
        has_more: next !== null,
      },
      meta: { as_of: {} },
    }),
  )

const readFirst = () =>
  getResolvedNamesPage({ address: ADDRESS }, { coinType: 'evm' })

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

    await readFirst()

    expect(bigname.addressNames).toHaveBeenCalledWith(
      ADDRESS,
      {
        namespace: 'ens',
        relation: 'resolves_to',
        coin_type: 'evm',
        sort: 'name',
        order: 'asc',
        page_size: 100,
      },
      { signal: undefined },
    )
  })

  it('reads one page and hands back the cursor to the next', async () => {
    listed([row('a.eth', [60])], 'next')
    detailed([detail('a.eth', { '60': ADDRESS })])

    const page = (await readFirst())._unsafeUnwrap()

    expect(page.next).toEqual({ cursor: 'next', coinType: 'evm' })
    expect(page.isEthereumOnly).toBe(false)
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

    const { names } = (await readFirst())._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual(['juveniles.eth'])
    expect(names[0]?.coinTypes.toSorted()).toEqual(['0', '2147483658', '60'])
  })

  it('falls back to Ethereum records when a name matched too many networks', async () => {
    vi.mocked(bigname.addressNames)
      .mockReturnValueOnce(
        errAsync(
          new BignameError({ code: 'unsupported', message: 'too many' }),
        ),
      )
      .mockReturnValueOnce(
        okAsync({
          data: [
            {
              ...row('a.eth', []),
              resolution: { coin_type: 60, record_key: 'addr:60' },
            },
          ],
          meta: { as_of: {} },
        }),
      )
    detailed([detail('a.eth', { '60': ADDRESS })])

    const page = (await readFirst())._unsafeUnwrap()

    expect(vi.mocked(bigname.addressNames).mock.calls[1]?.[1]).toMatchObject({
      coin_type: 60,
    })
    expect(page.isEthereumOnly).toBe(true)
    expect(page.names[0]?.coinTypes).toEqual(['60'])
  })

  it('fails a later page that matched too many networks', async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      errAsync(new BignameError({ code: 'unsupported', message: 'too many' })),
    )

    const result = await getResolvedNamesPage(
      { address: ADDRESS },
      { cursor: 'next', coinType: 'evm' },
    )

    expect(result._unsafeUnwrapErr()._tag).toBe(
      'GetResolvedNamesForAddressError',
    )
    expect(bigname.addressNames).toHaveBeenCalledOnce()
  })

  it('is empty without a lookup when no name points at the address', async () => {
    listed([])

    const { names } = (await readFirst())._unsafeUnwrap()

    expect(names).toEqual([])
    expect(bigname.lookup).not.toHaveBeenCalled()
  })
})
