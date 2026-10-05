import type {
  AddressNameRow,
  LookupNameResult,
  LookupProfileRecord,
  RecordGroups,
  UnsupportedName,
} from '@ens-apps/bigname'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

// The address 12l31213.eth's Polygon record holds on Sepolia: its coin-60
// record holds another address.
const ADDRESS = '0xd1b3cf4b18d061eaf28ea7ad91bc01e43598e252'
const OTHER = '0xa185365cbd2b2ac304e8c187a936faaa7350a51c'

const mockListAddressNames = vi.fn()
const mockLookup = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mockListAddressNames, lookup: mockLookup },
}))

const { getResolvedNamesForAddress } = await import(
  './useNamesForResolvedAddress'
)

const LAST_PAGE = {
  cursor: null,
  next_cursor: null,
  page_size: 200,
  total_count: null,
  has_more: false,
}

const row = (
  name: string,
  resolutions: AddressNameRow['resolutions'],
): AddressNameRow => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x00',
  registration_status: 'active',
  relations: ['resolves_to'],
  is_primary: false,
  resolutions,
})

const records = (
  addresses: RecordGroups['addresses'],
  seen_addresses: readonly string[] = Object.keys(addresses),
): RecordGroups => ({
  seen_addresses,
  addresses,
  seen_texts: [],
  texts: {},
  seen_abis: [],
  abis: {},
  seen_singletons: [],
  contenthash: null,
  name: null,
})

const profile = (
  name: string,
  recordGroups?: RecordGroups,
): LookupProfileRecord => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x00',
  registration_status: 'active',
  resolver: {
    chain_id: 11155111,
    address: '0x8948458626811dd0c23eb25cc74291247077cc51',
  },
  ...(recordGroups && { records: recordGroups }),
  chain_id: 11155111,
  network: 'ethereum-sepolia',
  authority: 'ens_v1',
  status: 'ok',
})

const nameResult = (
  name: string,
  record?: LookupNameResult['record'],
  status: LookupNameResult['status'] = 'ok',
): LookupNameResult => ({
  input: { name },
  kind: 'name',
  status,
  ...(record && { record }),
})

const listing = (...rows: AddressNameRow[]) => ({
  data: rows,
  page: LAST_PAGE,
  meta: {},
})

describe('getResolvedNamesForAddress', () => {
  beforeEach(() => {
    mockListAddressNames.mockReset()
    mockLookup.mockReset()
  })

  it('lists every coin type each name has an address record for, not only the ones holding the address', async () => {
    mockListAddressNames.mockResolvedValue(
      listing(
        row('012983102938012812.eth', [
          { coin_type: 60, record_key: 'addr:60' },
        ]),
        row('12l31213.eth', [
          { coin_type: 2147483785, record_key: 'addr:2147483785' },
        ]),
      ),
    )
    mockLookup.mockResolvedValue({
      data: [
        nameResult(
          '012983102938012812.eth',
          profile('012983102938012812.eth', records({ '60': ADDRESS })),
        ),
        nameResult(
          '12l31213.eth',
          profile(
            '12l31213.eth',
            records({ '2147483785': ADDRESS, '60': OTHER }, [
              '60',
              '2147483785',
            ]),
          ),
        ),
      ],
      meta: {},
    })

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([
      { name: '012983102938012812.eth', coinTypes: ['60'] },
      { name: '12l31213.eth', coinTypes: ['60', '2147483785'] },
    ])
    expect(mockListAddressNames).toHaveBeenCalledWith(ADDRESS, {
      namespace: 'ens',
      relation: 'resolves_to',
      coin_type: 'evm',
      sort: 'name',
      page_size: 200,
      cursor: undefined,
    })
    expect(mockLookup).toHaveBeenCalledOnce()
    expect(mockLookup).toHaveBeenCalledWith({
      inputs: [{ name: '012983102938012812.eth' }, { name: '12l31213.eth' }],
      profile: 'detail',
      namespace: 'ens',
    })
  })

  it('includes non-EVM coin types, ordered numerically', async () => {
    mockListAddressNames.mockResolvedValue(
      listing(
        row('yoginth.eth', [
          { coin_type: 60, record_key: 'addr:60' },
          { coin_type: 2147483704, record_key: 'addr:2147483704' },
        ]),
      ),
    )
    mockLookup.mockResolvedValue({
      data: [
        nameResult(
          'yoginth.eth',
          profile(
            'yoginth.eth',
            records(
              {
                '0': '0x0014311564348890e005880a9bc834aaa5884f1b5932',
                '2147483704': ADDRESS,
                '501':
                  '0x6752055c20b3e9d87447fe17f1877f05fdaf4f94cb7c0cd84a3b8aabf4d0e18e',
                '60': ADDRESS,
              },
              ['0', '60', '501', '2147483704'],
            ),
          ),
        ),
      ],
      meta: {},
    })

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([
      { name: 'yoginth.eth', coinTypes: ['0', '60', '501', '2147483704'] },
    ])
  })

  it('skips coin types bigname knows were cleared and keeps ones whose value it cannot vouch for', async () => {
    mockListAddressNames.mockResolvedValue(
      listing(row('a.eth', [{ coin_type: 60, record_key: 'addr:60' }])),
    )
    mockLookup.mockResolvedValue({
      data: [
        nameResult(
          'a.eth',
          profile(
            'a.eth',
            // 0 was cleared; 2147492101 was written with a value not known here.
            records({ '0': null, '60': ADDRESS }, ['0', '60', '2147492101']),
          ),
        ),
      ],
      meta: {},
    })

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([
      { name: 'a.eth', coinTypes: ['60', '2147492101'] },
    ])
  })

  it('falls back to the matched coin types for a name served without records', async () => {
    const unsupported: UnsupportedName = {
      name: 'unsupported.eth',
      display_name: 'unsupported.eth',
      namespace: 'ens',
      namehash: '0x00',
      status: 'unsupported',
      unsupported_reason: 'current_authority_not_projected',
    }
    mockListAddressNames.mockResolvedValue(
      listing(
        row('unsupported.eth', [{ coin_type: 60, record_key: 'addr:60' }]),
        row('no-inventory.eth', [
          { coin_type: 2147492101, record_key: 'addr:2147492101' },
        ]),
        row('missing.eth', [
          { coin_type: 2147483648, record_key: 'addr:2147483648' },
        ]),
      ),
    )
    mockLookup.mockResolvedValue({
      data: [
        nameResult('unsupported.eth', unsupported),
        nameResult('no-inventory.eth', profile('no-inventory.eth')),
        nameResult('missing.eth', undefined, 'not_found'),
      ],
      meta: {},
    })

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([
      { name: 'unsupported.eth', coinTypes: ['60'] },
      { name: 'no-inventory.eth', coinTypes: ['2147492101'] },
      { name: 'missing.eth', coinTypes: ['2147483648'] },
    ])
  })

  it('reads the records of more than 1,000 names in one lookup per 1,000', async () => {
    const names = Array.from({ length: 1001 }, (_, i) => `n${i}.eth`)
    mockListAddressNames.mockResolvedValue(
      listing(
        ...names.map((name) =>
          row(name, [{ coin_type: 60, record_key: 'addr:60' }]),
        ),
      ),
    )
    mockLookup.mockImplementation(
      async ({ inputs }: { inputs: { name: string }[] }) => ({
        data: inputs.map(({ name }) =>
          nameResult(
            name,
            profile(name, records({ '0': '0x00', '60': ADDRESS })),
          ),
        ),
        meta: {},
      }),
    )

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(mockLookup).toHaveBeenCalledTimes(2)
    expect(mockLookup.mock.calls[0]?.[0].inputs).toHaveLength(1000)
    expect(mockLookup.mock.calls[1]?.[0].inputs).toEqual([
      { name: 'n1000.eth' },
    ])
    const rows = result._unsafeUnwrap()
    expect(rows).toHaveLength(1001)
    expect(rows.every(({ coinTypes }) => coinTypes.join() === '0,60')).toBe(
      true,
    )
  })

  it('does not call lookup when no name resolves to the address', async () => {
    mockListAddressNames.mockResolvedValue(listing())

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    expect(result._unsafeUnwrap()).toEqual([])
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('fails when the record lookup fails', async () => {
    mockListAddressNames.mockResolvedValue(
      listing(row('a.eth', [{ coin_type: 60, record_key: 'addr:60' }])),
    )
    mockLookup.mockRejectedValue(new Error('request_timeout'))

    const result = await getResolvedNamesForAddress({ address: ADDRESS })

    assert(result.isErr())
    expect(result.error._tag).toBe('GetResolvedNamesForAddressError')
  })
})
