import type {
  AddressName,
  AddressNamesResponse,
  BignameClient,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import {
  IndexerReadError,
  type NameSummary,
  type Page,
  type ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DASHBOARD_CHUNK_SIZE,
  type DashboardNamesQuery,
  getDashboardGraceNames,
  getRenewableDashboardNames,
  readDashboardChunks,
} from './getDashboardNames'

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
  servedExpiry: null,
  registeredAt: null,
  createdAt: null,
  ...overrides,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
  totalCount: number | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount })

const QUERY: DashboardNamesQuery = {
  addresses: [EOA, SMART_ACCOUNT],
  sortField: 'expiry',
  sortDir: 'desc',
  search: '',
  version: null,
}

const graceRow: AddressName = {
  name: 'lapsed.eth',
  display_name: 'lapsed.eth',
  namespace: 'ens',
  namehash: '0x09',
  status: 'expired',
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

describe('readDashboardChunks', () => {
  it('reads the first chunk of every address in the requested order, with totals, until it lists a page', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ address, cursor }) =>
      okAsync(
        cursor === 'next'
          ? page([summary('carol.eth', '0x05')])
          : address === EOA
            ? page(
                [
                  summary('alice.eth', '0x01'),
                  summary('abc.addr.reverse', '0x04'),
                ],
                'next',
                12,
              )
            : page([summary('bob.eth', '0x02', { relations: ['manager'] })]),
      ),
    )

    const chunks = (
      await readDashboardChunks(readNames, QUERY, {})
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledWith({
      address: EOA,
      sort: 'expiry',
      order: 'desc',
      pageSize: DASHBOARD_CHUNK_SIZE,
      includeTotal: true,
    })
    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ address: EOA, cursor: 'next' }),
    )
    expect(
      chunks.map(({ address, names, hiddenCount, nextCursor, totalCount }) => ({
        address,
        names: names.map(({ name, nameRoles }) => [name, nameRoles]),
        hiddenCount,
        nextCursor,
        totalCount,
      })),
    ).toEqual([
      {
        address: EOA,
        names: [
          ['alice.eth', ['owner']],
          ['carol.eth', ['owner']],
        ],
        hiddenCount: 1,
        nextCursor: null,
        totalCount: 12,
      },
      {
        address: SMART_ACCOUNT,
        names: [['bob.eth', ['manager']]],
        hiddenCount: 0,
        nextCursor: null,
        totalCount: null,
      },
    ])
  })

  it('continues only the addresses with more, from their cursors', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() => okAsync(page([])))

    await readDashboardChunks(readNames, QUERY, {
      [EOA]: 'next',
      [SMART_ACCOUNT]: null,
    })

    expect(readNames).toHaveBeenCalledTimes(1)
    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ address: EOA, cursor: 'next' }),
    )
    expect(readNames.mock.calls[0]?.[0]).not.toHaveProperty('includeTotal')
  })

  it('searches by fragment, and a fragment bigname rejects matches nothing', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      errAsync(new IndexerReadError({ kind: 'rejected', cause: null })),
    )

    const chunks = (
      await readDashboardChunks(
        readNames,
        { ...QUERY, addresses: [EOA], search: 'al' },
        {},
      )
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ contains: 'al' }),
    )
    expect(chunks).toEqual([
      expect.objectContaining({ names: [], nextCursor: null, totalCount: 0 }),
    ])
  })

  it('asks bigname for only the chosen version', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() => okAsync(page([])))

    await readDashboardChunks(
      readNames,
      { ...QUERY, addresses: [EOA], version: 'v1' },
      {},
    )
    await readDashboardChunks(readNames, { ...QUERY, addresses: [EOA] }, {})

    expect(readNames.mock.calls[0]?.[0]).toMatchObject({ protocol: 'v1' })
    expect(readNames.mock.calls[1]?.[0]).not.toHaveProperty('protocol')
  })

  it('fails when a read fails', async () => {
    const result = await readDashboardChunks(
      () =>
        errAsync(new IndexerReadError({ kind: 'unavailable', cause: null })),
      QUERY,
      {},
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetDashboardNamesError')
  })
})

describe('getDashboardGraceNames', () => {
  it('reads ENSv2 names in grace from the former-owner read', async () => {
    const addressNames = vi.fn<BignameClient['addressNames']>(() =>
      okAsync(graceResponse([graceRow])),
    )

    const result = await getDashboardGraceNames(addressNames, [EOA], NOW)

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
    const result = await getDashboardGraceNames(
      () => errAsync(new BignameError({ code: 'overloaded', message: 'down' })),
      [EOA],
      NOW,
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetDashboardNamesError')
  })
})

describe('getRenewableDashboardNames', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads every held ENSv2 .eth name matching the search, plus names in grace', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ cursor }) =>
      okAsync(
        cursor
          ? page([summary('alpha.eth', '0x02')])
          : page([summary('alice.eth', '0x01')], 'next'),
      ),
    )
    const addressNames = vi.fn<BignameClient['addressNames']>(() =>
      okAsync(
        graceResponse([
          { ...graceRow, name: 'alapsed.eth', display_name: 'alapsed.eth' },
          graceRow,
        ]),
      ),
    )

    const result = await getRenewableDashboardNames(
      readNames,
      addressNames,
      [EOA],
      'al',
    )

    expect(readNames).toHaveBeenCalledWith({
      address: EOA,
      relations: ['owner'],
      protocol: 'v2',
      parent: 'eth',
      contains: 'al',
      pageSize: 200,
    })
    expect(
      result
        ._unsafeUnwrap()
        .map(({ name }) => name)
        .sort(),
    ).toEqual(['alapsed.eth', 'alice.eth', 'alpha.eth'])
  })
})
