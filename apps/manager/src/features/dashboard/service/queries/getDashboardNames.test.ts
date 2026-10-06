import type {
  AddressName,
  AddressNamesResponse,
  BignameClient,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { getDashboardNames } from './getDashboardNames'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const EOA = '0x0000000000000000000000000000000000000abc'
const SMART_ACCOUNT = '0x0000000000000000000000000000000000000def'
const NOW = new Date('2026-10-06T00:00:00Z')
const nowSeconds = NOW.getTime() / 1000

const summary = (
  name: string,
  namehash: `0x${string}`,
  overrides: Partial<NameSummary> = {},
): NameSummary => ({
  name,
  displayName: name,
  namehash,
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  registeredAt: null,
  createdAt: null,
  ...overrides,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount: null })

const graceRow: AddressName = {
  name: 'lapsed.eth',
  display_name: 'lapsed.eth',
  namespace: 'ens',
  namehash: '0x09',
  registration_status: 'released',
  authority: 'ens_v2',
  expires_at: String(nowSeconds - 86_400),
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: { owner: EOA, release_kind: 'expired' },
}

const graceResponse = (
  data: readonly AddressName[],
  nextCursor: string | null = null,
): AddressNamesResponse => ({
  data,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: 200,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: { as_of: {} },
})

const noGrace = vi.fn<BignameClient['addressNames']>(() =>
  okAsync(graceResponse([])),
)

describe('getDashboardNames', () => {
  it('reads every page of every address and merges their roles', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ address, cursor }) =>
      okAsync(
        address === EOA
          ? cursor
            ? page([summary('zed.eth', '0x03')])
            : page([summary('alice.eth', '0x01')], 'next')
          : page([
              summary('alice.eth', '0x01', { relations: ['manager'] }),
              summary('abc.addr.reverse', '0x04'),
            ]),
      ),
    )

    const result = await getDashboardNames(
      readNames,
      noGrace,
      [EOA, SMART_ACCOUNT],
      NOW,
    )

    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ address: EOA, sort: 'name', pageSize: 200 }),
    )
    expect(
      result
        ._unsafeUnwrap()
        .map(({ name, nameRoles }) => ({ name, nameRoles })),
    ).toEqual([
      { name: 'alice.eth', nameRoles: ['owner', 'manager'] },
      { name: 'zed.eth', nameRoles: ['owner'] },
    ])
  })

  it('adds ENSv2 names in grace from the former-owner read', async () => {
    const addressNames = vi.fn<BignameClient['addressNames']>(() =>
      okAsync(graceResponse([graceRow])),
    )

    const result = await getDashboardNames(
      () => okAsync(page([])),
      addressNames,
      [EOA],
      NOW,
    )

    expect(addressNames).toHaveBeenCalledWith(EOA, {
      namespace: 'ens',
      relation: 'former_owner',
      parent: 'eth',
      sort: 'expires_at',
      order: 'asc',
      expires_after: String(nowSeconds - 28 * 86_400),
      expires_before: String(nowSeconds + 1),
      page_size: 200,
    })
    expect(result._unsafeUnwrap()).toEqual([
      expect.objectContaining({ name: 'lapsed.eth', nameRoles: [] }),
    ])
  })

  it('fails when the grace read fails', async () => {
    const result = await getDashboardNames(
      () => okAsync(page([])),
      () => errAsync(new BignameError({ code: 'overloaded', message: 'down' })),
      [EOA],
      NOW,
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetDashboardNamesError')
  })
})
