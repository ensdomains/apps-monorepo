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
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import { bigname } from '@/lib/bigname'
import { mergeDashboardChunks } from '../../dashboardNames'
import { getDashboardNameVisibility } from '../../dashboardNameVisibility'
import {
  DASHBOARD_CHUNK_SIZE,
  type DashboardNamesQuery,
  getDashboardGraceNames,
  getDashboardNamesInfiniteQueryOptions,
  getRenewableDashboardNames,
  readDashboardChunks,
} from './getDashboardNames'

vi.mock('@/lib/bigname', () => ({ bigname: { addressNames: vi.fn() } }))

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
  graceEndsAt: null,
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
  grace_ends_at: String(nowSeconds - 86_400 + 28 * 86_400),
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

    expect(readNames).toHaveBeenCalledWith(
      {
        address: EOA,
        sort: 'expiry',
        order: 'desc',
        pageSize: DASHBOARD_CHUNK_SIZE,
        includeTotal: true,
      },
      expect.anything(),
    )
    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ address: EOA, cursor: 'next' }),
      expect.anything(),
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
      expect.anything(),
    )
    expect(readNames.mock.calls[0]?.[0]).not.toHaveProperty('includeTotal')
  })

  it('reads past a hidden-only page and excludes hidden names from the complete total', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ cursor }) =>
      okAsync(
        cursor === undefined
          ? page(
              [
                summary('registry-only.eth', '0x01', {
                  relations: ['role_holder'],
                }),
              ],
              'next',
              3,
            )
          : page([
              summary('owner.eth', '0x02'),
              summary('writer.eth', '0x03', { relations: ['manager'] }),
            ]),
      ),
    )
    const chunks = (
      await readDashboardChunks(
        readNames,
        { ...QUERY, addresses: [EOA] },
        {},
        getDashboardNameVisibility(async (name) => name === 'writer.eth'),
      )
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledTimes(2)
    expect(chunks[0]).toMatchObject({ hiddenCount: 1, nextCursor: null })
    const merged = mergeDashboardChunks({
      chunks,
      graceNames: [],
      field: 'name',
      dir: 'asc',
    })
    expect(merged.names.map(({ name }) => name)).toEqual([
      'owner.eth',
      'writer.eth',
    ])
    expect(merged).toMatchObject({ total: 2, isComplete: true })
  })

  it('reports an empty list and zero count for a registry-only wallet', async () => {
    const chunks = (
      await readDashboardChunks(
        () =>
          okAsync(
            page(
              [
                summary('registry-only.eth', '0x01', {
                  relations: ['role_holder'],
                }),
              ],
              null,
              1,
            ),
          ),
        { ...QUERY, addresses: [EOA] },
        {},
        getDashboardNameVisibility(async () => false),
      )
    )._unsafeUnwrap()

    expect(
      mergeDashboardChunks({
        chunks,
        graceNames: [],
        field: 'name',
        dir: 'asc',
      }),
    ).toMatchObject({ names: [], total: 0, isComplete: true })
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
      expect.anything(),
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

describe('getDashboardNamesInfiniteQueryOptions', () => {
  it("does not reuse another editor wallet's cached visibility result", async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      okAsync(
        graceResponse([
          {
            name: 'managed.eth',
            display_name: 'managed.eth',
            namespace: 'ens',
            namehash: '0x01',
            status: 'active',
            authority: 'ens_v2',
            expires_at: '1800000000',
            relations: ['role_holder'],
            is_primary: false,
          },
        ]),
      ),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    })
    client.setQueryData(
      resolverWriteAccessQuery('managed.eth', EOA).queryKey,
      false,
    )
    client.setQueryData(
      resolverWriteAccessQuery('managed.eth', SMART_ACCOUNT).queryKey,
      true,
    )
    const query: DashboardNamesQuery = {
      ...QUERY,
      addresses: [SMART_ACCOUNT],
    }

    try {
      const denied = await client.fetchInfiniteQuery(
        getDashboardNamesInfiniteQueryOptions(
          { ...query, recordEditorAddress: EOA },
          client,
        ),
      )
      const allowed = await client.fetchInfiniteQuery(
        getDashboardNamesInfiniteQueryOptions(
          { ...query, recordEditorAddress: SMART_ACCOUNT },
          client,
        ),
      )

      expect(denied.pages[0]?.[0]?.names).toEqual([])
      expect(allowed.pages[0]?.[0]?.names.map(({ name }) => name)).toEqual([
        'managed.eth',
      ])
    } finally {
      client.clear()
    }
  })
})

describe('getDashboardGraceNames', () => {
  it('reads ENSv2 names in grace from the former-owner read', async () => {
    const addressNames = vi.fn<BignameClient['addressNames']>(() =>
      okAsync(graceResponse([graceRow])),
    )

    const signal = new AbortController().signal
    const result = await getDashboardGraceNames(addressNames, [EOA], {
      now: NOW,
      signal,
    })

    expect(addressNames).toHaveBeenCalledWith(
      EOA,
      {
        namespace: 'ens',
        relation: 'former_owner',
        parent: 'eth',
        sort: 'expires_at',
        order: 'asc',
        expires_after: String(nowSeconds - 28 * 86_400),
        expires_before: String(nowSeconds + 1),
        page_size: 200,
      },
      { signal },
    )
    expect(result._unsafeUnwrap()).toEqual([
      expect.objectContaining({ name: 'lapsed.eth', nameRoles: [] }),
    ])
  })

  it('fails when the grace read fails', async () => {
    const result = await getDashboardGraceNames(
      () => errAsync(new BignameError({ code: 'overloaded', message: 'down' })),
      [EOA],
      { now: NOW },
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

    expect(readNames).toHaveBeenCalledWith(
      {
        address: EOA,
        relations: ['owner'],
        protocol: 'v2',
        parent: 'eth',
        contains: 'al',
        pageSize: 200,
      },
      expect.anything(),
    )
    expect(
      result
        ._unsafeUnwrap()
        .map(({ name }) => name)
        .sort(),
    ).toEqual(['alapsed.eth', 'alice.eth', 'alpha.eth'])
  })
})
