import {
  type AddressNameRow,
  BignameError,
  type ListAddressNamesParams,
} from '@ens-apps/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListAddressNames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mockListAddressNames },
}))

const { getAddressNames } = await import('./useAddressNames')

const ADDRESS = '0x1ca2b10c61d0d92f2096209385c6cb33e3691b5e'

const row = (overrides: Partial<AddressNameRow>): AddressNameRow => ({
  name: 'test.eth',
  display_name: 'test.eth',
  namespace: 'ens',
  namehash: '0x00',
  relations: ['owner', 'manager'],
  is_primary: false,
  registration_status: 'active',
  created_at: '1723053708',
  authority: 'ens_v1',
  ...overrides,
})

const page = (data: AddressNameRow[]) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count: null,
    has_more: false,
  },
  meta: {},
})

const unsupported = () =>
  new BignameError({
    status: 422,
    code: 'unsupported',
    message: 'role_summary exceeds the grant budget',
    url: `/v1/addresses/${ADDRESS}/names`,
  })

/** The address's Sepolia shape: subnames granted to it, plus two 2LDs that only resolve to it. */
const granted = row({
  name: 'a.openregistry.eth',
  namehash: '0x01',
  registration_status: 'unregistered',
  subname_count: 0,
})
const resolveOnly = [
  row({
    name: 'openregistry.eth',
    namehash: '0x02',
    relations: ['resolves_to'],
    resolution: { coin_type: 60, record_key: 'addr:60' },
    expires_at: '1823018508',
    ens_v1: { expires_at: '1817661708' },
    subname_count: 13,
  }),
  row({
    name: 'publicregistry.eth',
    namehash: '0x03',
    relations: ['resolves_to'],
    resolution: { coin_type: 60, record_key: 'addr:60' },
    expires_at: '1823018508',
    ens_v1: { expires_at: '1817661708' },
    subname_count: 32,
  }),
]

const byRelation =
  (rows: {
    readonly any: AddressNameRow[] | Error
    readonly resolves_to: AddressNameRow[] | Error
  }) =>
  (_address: string, params: ListAddressNamesParams) => {
    const result =
      params.relation === 'resolves_to' ? rows.resolves_to : rows.any
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(page(result))
  }

describe('getAddressNames', () => {
  beforeEach(() => {
    mockListAddressNames.mockReset()
  })

  it('reads the authority relations and the ETH-address resolutions', async () => {
    mockListAddressNames.mockImplementation(
      byRelation({ any: [granted], resolves_to: resolveOnly }),
    )

    const names = (await getAddressNames({ address: ADDRESS }))._unsafeUnwrap()

    expect(names.map(({ name, relations }) => [name, relations])).toEqual([
      ['openregistry.eth', ['resolves_to']],
      ['publicregistry.eth', ['resolves_to']],
      ['a.openregistry.eth', ['owner', 'manager']],
    ])
    expect(mockListAddressNames).toHaveBeenCalledTimes(2)
    expect(mockListAddressNames).toHaveBeenCalledWith(ADDRESS, {
      namespace: 'ens',
      relation: 'any',
      include: ['counts', 'role_summary'],
      sort: 'expires_at',
      order: 'asc',
      page_size: 200,
      cursor: undefined,
    })
    expect(mockListAddressNames).toHaveBeenCalledWith(ADDRESS, {
      namespace: 'ens',
      relation: 'resolves_to',
      coin_type: 60,
      include: ['counts'],
      sort: 'expires_at',
      order: 'asc',
      page_size: 200,
      cursor: undefined,
    })
  })

  it('lists a name on both reads once, with its authority relations', async () => {
    const owned = row({
      name: 'leon000.eth',
      namehash: '0x04',
      relations: ['owner'],
    })
    mockListAddressNames.mockImplementation(
      byRelation({
        any: [owned],
        resolves_to: [{ ...owned, relations: ['resolves_to'] }],
      }),
    )

    const names = (await getAddressNames({ address: ADDRESS }))._unsafeUnwrap()

    expect(names).toHaveLength(1)
    expect(names[0]).toMatchObject({
      name: 'leon000.eth',
      relations: ['owner'],
      v1Roles: { owner: true, manager: false },
    })
  })

  it('keeps the resolutions when role_summary falls back to counts', async () => {
    mockListAddressNames.mockImplementation(
      (_address: string, params: ListAddressNamesParams) =>
        params.relation === 'any' && params.include?.includes('role_summary')
          ? Promise.reject(unsupported())
          : byRelation({ any: [granted], resolves_to: resolveOnly })(
              _address,
              params,
            ),
    )

    const names = (await getAddressNames({ address: ADDRESS }))._unsafeUnwrap()

    expect(names).toHaveLength(3)
    expect(mockListAddressNames).toHaveBeenCalledTimes(3)
  })

  it('fails when the resolution read fails', async () => {
    mockListAddressNames.mockImplementation(
      byRelation({
        any: [granted],
        resolves_to: new BignameError({
          status: 503,
          code: 'overloaded',
          message: 'overloaded',
          url: `/v1/addresses/${ADDRESS}/names`,
        }),
      }),
    )

    const result = await getAddressNames({ address: ADDRESS })

    expect(result.isErr()).toBe(true)
  })
})
