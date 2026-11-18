import {
  IndexerReadError,
  type NameDetail,
  type NameSummary,
} from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexer } from '@/lib/indexer'
import { getAddressNames } from './useAddressNames'

vi.mock('@/lib/indexer', () => ({
  indexer: {
    getNamesForAddress: vi.fn(),
    getLapsedNames: vi.fn(),
    getNames: vi.fn(),
  },
}))

const ADDRESS = '0x1111111111111111111111111111111111111111'
const NOW = Temporal.Instant.from('2026-10-08T00:00:00Z')
const NOW_MS = NOW.epochMilliseconds
const DAY_MS = 86_400_000

const row = (
  name: string,
  overrides: Partial<NameSummary> = {},
): NameSummary => ({
  name,
  displayName: name,
  namehash: '0x01',
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: new Date(NOW_MS + DAY_MS * 300),
  servedExpiry: null,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
  subnameCount: 2,
  recordCount: 5,
  ...overrides,
})

const v1Expiring = (name: string, expiresAt: Date | null) =>
  row(name, { protocol: 'v1', expiresAt })

const detail = (name: string, expiresAt: Date | null): NameDetail => ({
  name,
  displayName: name,
  namehash: '0x02',
  protocol: 'v1',
  isSupported: true,
  owner: null,
  manager: null,
  registrant: null,
  resolver: null,
  registrationStatus: 'active',
  expiresAt,
  graceEndsAt: null,
  registeredAt: null,
  registrationId: null,
  createdAt: null,
  migratedAt: null,
  unresolvableReason: null,
  addressCoinTypes: null,
})

const unavailable = () =>
  errAsync(
    new IndexerReadError({ kind: 'unavailable', message: 'busy', cause: null }),
  )

// Answers the current-relations walk and the lapsed read separately.
const answer = (
  current: readonly (readonly NameSummary[])[],
  lapsed: readonly NameSummary[] = [],
) => {
  let currentCall = 0
  vi.mocked(indexer.getNamesForAddress).mockImplementation(() => {
    const index = currentCall++
    return okAsync({
      items: current[index] ?? [],
      nextCursor: index < current.length - 1 ? `page-${index + 1}` : null,
      totalCount: null,
    })
  })
  vi.mocked(indexer.getLapsedNames).mockReturnValue(okAsync(lapsed))
}

const queries = () =>
  vi.mocked(indexer.getNamesForAddress).mock.calls.map(([query]) => query)

const lookups = () =>
  vi.mocked(indexer.getNames).mock.calls.map(([query]) => query.names)

beforeEach(() => vi.clearAllMocks())

describe('getAddressNames', () => {
  it('lists every relation in either era with its counts, soonest expiry first', async () => {
    answer([
      [
        row('later.eth'),
        row('legacy.eth', {
          protocol: 'v1',
          relations: ['owner', 'manager'],
          expiresAt: new Date(NOW_MS + DAY_MS * 10),
        }),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(queries()[0]).toEqual(
      expect.objectContaining({ address: ADDRESS, includeCounts: true }),
    )
    expect(queries()[0]).not.toHaveProperty('relations')
    expect(names).toEqual([
      expect.objectContaining({
        name: 'legacy.eth',
        protocolVersion: 'ENSv1',
        relations: ['owner', 'manager'],
      }),
      expect.objectContaining({
        name: 'later.eth',
        protocolVersion: 'ENSv2',
        relations: ['owner'],
        subdomainCount: 2,
        recordCount: 5,
      }),
    ])
  })

  it('reads every page of the current relations', async () => {
    answer([[row('a.eth')], [row('b.eth')]])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name).sort()).toEqual(['a.eth', 'b.eth'])
    expect(queries()).toContainEqual(
      expect.objectContaining({ cursor: 'page-1' }),
    )
  })

  it('hides reverse records and released names', async () => {
    answer([
      [
        row('abc.addr.reverse'),
        row('gone.eth', { registrationStatus: 'released' }),
        row('kept.eth'),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual(['kept.eth'])
  })

  // Which rows count as lapsed is tested with isLapsedName.
  it('merges the names still renewable in grace into the list', async () => {
    answer(
      [[row('held.eth')]],
      [
        row('lapsed.eth', {
          registrationStatus: 'expired',
          relations: [],
          expiresAt: new Date(NOW_MS - DAY_MS),
          graceEndsAt: new Date(NOW_MS + DAY_MS * 27),
        }),
      ],
    )

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(vi.mocked(indexer.getLapsedNames).mock.calls[0]?.[0]).toEqual({
      address: ADDRESS,
      now: new Date(NOW_MS),
      since: new Date(NOW_MS - DAY_MS * 30),
    })
    expect(names).toEqual([
      expect.objectContaining({
        name: 'lapsed.eth',
        status: 'expired',
        relations: ['former_owner'],
        protocolVersion: 'ENSv2',
      }),
      expect.objectContaining({ name: 'held.eth' }),
    ])
  })

  it('gives ENSv1 subnames the expiry of their .eth parent', async () => {
    const LISTED_EXPIRY = new Date(NOW_MS + DAY_MS * 30)
    const LOOKED_UP_EXPIRY = new Date(NOW_MS + DAY_MS * 60)
    answer([
      [
        v1Expiring('listed.eth', LISTED_EXPIRY),
        v1Expiring('sub.listed.eth', null),
        v1Expiring('deep.sub.other.eth', null),
      ],
    ])
    vi.mocked(indexer.getNames).mockReturnValue(
      okAsync([detail('other.eth', LOOKED_UP_EXPIRY)]),
    )

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(lookups()).toEqual([['other.eth']])
    expect(names).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'sub.listed.eth',
          expiryDate: null,
          parentExpiryDate: LISTED_EXPIRY,
        }),
        expect.objectContaining({
          name: 'deep.sub.other.eth',
          parentExpiryDate: LOOKED_UP_EXPIRY,
        }),
      ]),
    )
  })

  it("orders subnames by their parent's expiry", async () => {
    answer([
      [
        row('later.eth'),
        v1Expiring('sub.soon.eth', null),
        v1Expiring('soon.eth', new Date(NOW_MS + DAY_MS * 10)),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual([
      'soon.eth',
      'sub.soon.eth',
      'later.eth',
    ])
  })

  it('looks parents up in batches of at most 1000', async () => {
    const PARENT_COUNT = 1001
    answer([
      Array.from({ length: PARENT_COUNT }, (_, index) =>
        v1Expiring(`sub.parent${index}.eth`, null),
      ),
    ])
    vi.mocked(indexer.getNames).mockImplementation(({ names }) =>
      okAsync(names.map(() => null)),
    )

    await getAddressNames({ address: ADDRESS }, { now: NOW })

    expect(lookups().map((names) => names.length)).toEqual([1000, 1])
  })

  it('lists subnames without a parent expiry when its read fails', async () => {
    answer([[v1Expiring('sub.parent.eth', null)]])
    vi.mocked(indexer.getNames).mockReturnValue(unavailable())

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names).toEqual([
      expect.objectContaining({
        name: 'sub.parent.eth',
        parentExpiryDate: null,
      }),
    ])
  })

  it('fails when a read fails', async () => {
    vi.mocked(indexer.getNamesForAddress).mockReturnValue(unavailable())
    vi.mocked(indexer.getLapsedNames).mockReturnValue(unavailable())

    const result = await getAddressNames({ address: ADDRESS }, { now: NOW })

    expect(result._unsafeUnwrapErr()._tag).toBe('GetAddressNamesError')
  })
})
