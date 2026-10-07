import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { IndexerReadError } from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import {
  getProfileNameCounts,
  PROFILE_NAMES_CHUNK_SIZE,
  type ProfileNamesChunk,
  type ProfileNamesQuery,
  readProfileNamesChunk,
  toProfileNamesPage,
} from './profileAddressNames'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const ADDRESS = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

const summary = (
  name: string,
  relations: NameSummary['relations'] = ['owner'],
): NameSummary => ({
  name,
  displayName: name,
  namehash: `0x${name.length.toString(16)}`,
  protocol: 'v2',
  relations,
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'registered',
  expiresAt: null,
  servedExpiry: null,
  registeredAt: null,
  createdAt: null,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
  totalCount: number | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount })

const QUERY: ProfileNamesQuery = {
  address: ADDRESS,
  scope: 'all',
  sortField: 'created',
  sortDir: 'desc',
  search: '',
}

describe('readProfileNamesChunk', () => {
  it('reads the first chunk in the requested order with an exact total', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ cursor }) =>
      okAsync(
        cursor === undefined
          ? page(
              [
                summary('alice.eth'),
                summary('bob.eth'),
                summary('carol.eth'),
                summary('dave.eth'),
                summary('erin.eth'),
                summary('abc.addr.reverse'),
              ],
              'next',
              12,
            )
          : page([]),
      ),
    )

    const chunk = (
      await readProfileNamesChunk(readNames, QUERY, undefined)
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledWith({
      address: ADDRESS,
      relations: undefined,
      sort: 'created',
      order: 'desc',
      pageSize: PROFILE_NAMES_CHUNK_SIZE,
      includeTotal: true,
    })
    expect(readNames).toHaveBeenCalledTimes(1)
    expect(chunk).toMatchObject({
      names: [
        { label: 'alice.eth' },
        { label: 'bob.eth' },
        { label: 'carol.eth' },
        { label: 'dave.eth' },
        { label: 'erin.eth' },
      ],
      hiddenCount: 1,
      nextCursor: 'next',
      totalCount: 12,
    })
  })

  it('reads on while the managed list hides most of a chunk, keeping the first total', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ cursor }) =>
      okAsync(
        cursor === undefined
          ? page(
              [
                summary('owned.eth', ['owner', 'manager']),
                summary('one.eth', ['manager']),
              ],
              'next',
              8,
            )
          : page([summary('two.eth', ['manager'])], null, null),
      ),
    )

    const chunk = (
      await readProfileNamesChunk(
        readNames,
        { ...QUERY, scope: 'managed' },
        undefined,
      )
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'next' }),
    )
    expect(chunk).toMatchObject({
      names: [{ label: 'one.eth' }, { label: 'two.eth' }],
      hiddenCount: 1,
      nextCursor: null,
      totalCount: 8,
    })
  })

  it('continues from the cursor without asking for the total again', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() => okAsync(page([])))

    await readProfileNamesChunk(
      readNames,
      { ...QUERY, scope: 'owned', search: 'al' },
      'next',
    )

    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ['owner'],
        contains: 'al',
        cursor: 'next',
      }),
    )
    expect(readNames.mock.calls[0]?.[0]).not.toHaveProperty('includeTotal')
  })

  it('lists only names the address manages without owning on the managed list', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(
        page([
          summary('both.eth', ['owner', 'manager']),
          summary('managed.eth', ['manager']),
          summary('role.eth', ['role_holder']),
        ]),
      ),
    )

    const chunk = (
      await readProfileNamesChunk(
        readNames,
        { ...QUERY, scope: 'managed' },
        undefined,
      )
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ relations: ['manager', 'role_holder'] }),
    )
    expect(chunk.names.map(({ label }) => label)).toEqual([
      'managed.eth',
      'role.eth',
    ])
    expect(chunk.hiddenCount).toBe(1)
  })

  it('matches nothing for a search bigname rejects, and fails on any other error', async () => {
    const rejected = await readProfileNamesChunk(
      () => errAsync(new IndexerReadError({ kind: 'rejected', cause: null })),
      { ...QUERY, search: '%' },
      undefined,
    )
    expect(rejected._unsafeUnwrap()).toMatchObject({
      names: [],
      nextCursor: null,
      totalCount: 0,
    })

    const failed = await readProfileNamesChunk(
      () =>
        errAsync(new IndexerReadError({ kind: 'unavailable', cause: null })),
      QUERY,
      undefined,
    )
    expect(failed._unsafeUnwrapErr()._tag).toBe('GetProfileAddressNamesError')
  })
})

describe('toProfileNamesPage', () => {
  const chunk = (
    labels: readonly string[],
    nextCursor: string | null,
    extra: Partial<ProfileNamesChunk> = {},
  ): ProfileNamesChunk => ({
    names: labels.map((label) => ({
      key: label,
      label,
      protocol: 'v2',
      expiryDate: null,
      createdAt: null,
      nameRoles: ['owner'],
      roleCategory: 'owned',
    })),
    hiddenCount: 0,
    nextCursor,
    totalCount: null,
    ...extra,
  })

  it('counts bigname totals less hidden rows until every chunk is read, then exactly', () => {
    expect(
      toProfileNamesPage(
        [chunk(['a.eth'], 'more', { totalCount: 10, hiddenCount: 1 })],
        1,
        5,
      ),
    ).toMatchObject({ total: 9, isComplete: false })

    expect(
      toProfileNamesPage([chunk(['a.eth', 'b.eth'], null)], 1, 5),
    ).toMatchObject({ total: 2, isComplete: true })
  })

  it('shows the last page when the total shrinks below the requested one', () => {
    const result = toProfileNamesPage(
      [chunk(['a.eth', 'b.eth', 'c.eth', 'd.eth', 'e.eth', 'f.eth'], null)],
      3,
      5,
    )

    expect(result.names.map(({ label }) => label)).toEqual(['f.eth'])
    expect(result.needed).toBe(10)
  })
})

describe('getProfileNameCounts', () => {
  it('counts managed names as every relation less the owned ones', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(({ relations }) =>
      okAsync(page([], null, relations ? 7 : 10)),
    )

    const counts = (
      await getProfileNameCounts(readNames, ADDRESS)
    )._unsafeUnwrap()

    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ['owner'],
        pageSize: 1,
        includeTotal: true,
      }),
    )
    expect(counts).toEqual({ owned: 7, managed: 3 })
  })

  it('has no counts when bigname gives no exact total', async () => {
    const counts = await getProfileNameCounts(
      () => okAsync(page([], null, null)),
      ADDRESS,
    )

    expect(counts._unsafeUnwrap()).toBeNull()
  })
})
