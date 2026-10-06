import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMergedNamesList,
  compareMerged,
  type DashboardName,
  type MergedItem,
  mergedRowMetadata,
} from './mergedNames'

const makeName = (overrides: Partial<DashboardName> = {}): DashboardName => ({
  key: '0x01',
  name: 'alice.eth',
  protocol: 'v2',
  expiryDate: 100n,
  createdAt: 100n,
  nameRoles: ['owner'],
  isLapsed: false,
  ...overrides,
})

const makeMerged = (overrides: Partial<MergedItem> = {}): MergedItem => ({
  kind: 'v2',
  key: '0x01',
  sortName: 'alice.eth',
  sortExpiry: 100n,
  sortCreated: 100n,
  name: makeName(),
  isMigrationEligible: false,
  ...overrides,
})

const makeMergedV2 = (overrides: Partial<MergedItem> = {}) =>
  makeMerged(overrides)

const makeMergedV1 = (overrides: Partial<MergedItem> = {}) =>
  makeMerged({
    kind: 'v1',
    sortName: 'bob.eth',
    sortExpiry: 0n,
    sortCreated: null,
    ...overrides,
  })

describe('compareMerged', () => {
  const a = makeMergedV2({ sortName: 'alpha.eth', sortExpiry: 10n })
  const b = makeMergedV2({ sortName: 'beta.eth', sortExpiry: 20n })
  const noExpiry = makeMergedV1({ sortName: 'gamma.eth', sortExpiry: 0n })
  const older = makeMergedV2({
    sortName: 'older.eth',
    sortExpiry: 20n,
    sortCreated: 10n,
  })
  const newer = makeMergedV2({
    sortName: 'newer.eth',
    sortExpiry: 10n,
    sortCreated: 20n,
  })
  const noCreated = makeMergedV1({
    sortName: 'unknown.eth',
    sortExpiry: 1n,
  })

  it('sorts by name asc', () => {
    expect(compareMerged(a, b, 'name', 'asc')).toBeLessThan(0)
  })
  it('sorts by name desc', () => {
    expect(compareMerged(a, b, 'name', 'desc')).toBeGreaterThan(0)
  })
  it('sorts by expiry asc', () => {
    expect(compareMerged(a, b, 'expiry', 'asc')).toBeLessThan(0)
  })
  it('pushes null expiry to the end regardless of direction', () => {
    expect(compareMerged(a, noExpiry, 'expiry', 'asc')).toBeLessThan(0)
    expect(compareMerged(a, noExpiry, 'expiry', 'desc')).toBeLessThan(0)
  })
  it('pushes zero expiry to the end like null expiry', () => {
    const nonExpiring = makeMergedV1({
      sortName: 'non-expiring.eth',
      sortExpiry: 0n,
    })
    expect(compareMerged(a, nonExpiring, 'expiry', 'asc')).toBeLessThan(0)
    expect(compareMerged(a, nonExpiring, 'expiry', 'desc')).toBeLessThan(0)
  })
  it('returns 0 when both expiries are null', () => {
    const c = makeMergedV1({ sortName: 'delta.eth', sortExpiry: 0n })
    expect(compareMerged(noExpiry, c, 'expiry', 'asc')).toBe(0)
  })
  it('sorts by created date and keeps unknown created dates last', () => {
    expect(compareMerged(older, newer, 'created', 'asc')).toBeLessThan(0)
    expect(compareMerged(older, noCreated, 'created', 'desc')).toBeLessThan(0)
  })
})

describe('buildMergedNamesList', () => {
  const names = [
    makeName({
      key: '0x1',
      name: 'alpha.eth',
      expiryDate: 200n,
      createdAt: 100n,
    }),
    makeName({
      key: '0x2',
      name: 'zeta.eth',
      expiryDate: 100n,
      createdAt: 200n,
    }),
    makeName({
      key: '0x3',
      name: 'mike.eth',
      protocol: 'v1',
      expiryDate: 0n,
      createdAt: null,
    }),
    makeName({
      key: '0x4',
      name: 'beta.eth',
      protocol: 'v1',
      expiryDate: 50n,
      createdAt: null,
    }),
  ]

  it('sorts v1 and v2 names together by name asc', () => {
    const items = buildMergedNamesList({
      names,
      searchQuery: '',
      sortField: 'name',
      sortDir: 'asc',
    })
    expect(items.map((i) => i.sortName)).toEqual([
      'alpha.eth',
      'beta.eth',
      'mike.eth',
      'zeta.eth',
    ])
    expect(items.map((i) => i.kind)).toEqual(['v2', 'v1', 'v1', 'v2'])
  })

  it('filters by a substring, case-insensitively', () => {
    const items = buildMergedNamesList({
      names,
      searchQuery: 'TA',
      sortField: 'name',
      sortDir: 'asc',
    })
    expect(items.map((i) => i.sortName)).toEqual(['beta.eth', 'zeta.eth'])
  })

  it('sorts by expiry asc with non-expiring names last', () => {
    const items = buildMergedNamesList({
      names,
      searchQuery: '',
      sortField: 'expiry',
      sortDir: 'asc',
    })
    expect(items.map((i) => i.sortExpiry)).toEqual([50n, 100n, 200n, 0n])
  })

  describe('un-normalised stored names', () => {
    const LABELHASH = `[${'ab'.repeat(32)}]`

    it('hides v2 and v1 names that are not their own ENSIP-15 spelling', () => {
      const items = buildMergedNamesList({
        v2Names: [
          makeV2({ id: '0x1', name: 'alpha.eth' }),
          makeV2({ id: '0x2', name: 'ALPHA.eth' }),
          makeV2({ id: '0x3', name: 'vi\u00adtalik.eth' }),
        ],
        v1Classified: [
          makeV1({ id: '0x4', name: 'mike.eth', label: 'mike' }),
          makeV1({ id: '0x5', name: 'MIKE.eth', label: 'MIKE' }),
        ],
        searchQuery: '',
        sortField: 'name',
        sortDir: 'asc',
      })
      expect(items.map((i) => i.sortName)).toEqual(['alpha.eth', 'mike.eth'])
    })

    it('keeps names the indexer has no label for', () => {
      const items = buildMergedNamesList({
        v2Names: [
          makeV2({ id: '0x1', name: null, normalizedName: null }),
          makeV2({ id: '0x2', name: `${LABELHASH}.eth` }),
          makeV2({ id: '0x3', name: '\u{1f680}\u{1f680}\u{1f680}.eth' }),
        ],
        v1Classified: [],
        searchQuery: '',
        sortField: 'name',
        sortDir: 'asc',
      })
      expect(items).toHaveLength(3)
    })

    it('leaves hidden names out of the count', () => {
      expect(
        getMergedNamesCount({
          v2Names: [
            makeV2({ id: '0x1', name: 'alpha.eth' }),
            makeV2({ id: '0x2', name: 'ALPHA.eth' }),
          ],
          v1Classified: [
            makeV1({ id: '0x3', name: 'mike.eth', label: 'mike' }),
            makeV1({ id: '0x4', name: 'MIKE.eth', label: 'MIKE' }),
          ],
        }),
      ).toBe(2)
    })

    it('keeps a canonical v1 name whose only v2 twin is hidden', () => {
      const params = {
        v2Names: [makeV2({ id: '0x1', name: 'ALPHA.eth' })],
        v1Classified: [
          makeV1({ id: '0x2', name: 'alpha.eth', label: 'alpha' }),
        ],
      }
      const items = buildMergedNamesList({
        ...params,
        searchQuery: '',
        sortField: 'name',
        sortDir: 'asc',
      })
      expect(items.map((i) => [i.kind, i.sortName])).toEqual([
        ['v1', 'alpha.eth'],
      ])
      expect(getMergedNamesCount(params)).toBe(1)
    })
  })

  it('sorts by created date desc with unknowns last', () => {
    const items = buildMergedNamesList({
      names,
      searchQuery: '',
      sortField: 'created',
      sortDir: 'desc',
    })
    expect(items.map((i) => i.sortName).slice(0, 2)).toEqual([
      'zeta.eth',
      'alpha.eth',
    ])
  })

  it('marks only eligible ENSv1 names for upgrade', () => {
    const items = buildMergedNamesList({
      names,
      eligibleKeys: new Set(['0x1', '0x4']),
      searchQuery: '',
      sortField: 'name',
      sortDir: 'asc',
    })
    expect(
      items.filter((i) => i.isMigrationEligible).map((i) => i.sortName),
    ).toEqual(['beta.eth'])
  })
})

describe('mergedRowMetadata', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flags v2 name matching primaryLabel as primary', () => {
    const item = makeMergedV2({ sortName: 'alice.eth', sortExpiry: 0n })
    const meta = mergedRowMetadata(item, 'alice.eth')
    expect(meta.isPrimary).toBe(true)
    expect(meta.isV1).toBe(false)
  })

  it('never flags v1 items as primary even on label match', () => {
    const item = makeMergedV1({ sortName: 'bob.eth', sortExpiry: 0n })
    const meta = mergedRowMetadata(item, 'bob.eth')
    expect(meta.isPrimary).toBe(false)
    expect(meta.isV1).toBe(true)
    expect(meta.avatarUrl).toBeUndefined()
  })

  it('takes the v2 avatar from avatarOverride only', () => {
    const item = makeMergedV2()
    expect(mergedRowMetadata(item, null, 'override').avatarUrl).toBe('override')
    expect(mergedRowMetadata(item, null).avatarUrl).toBeUndefined()
  })

  it('computes expiringSoon within 30 days', () => {
    const tenDaysFromNow = Math.floor(
      new Date('2024-01-11T00:00:00Z').getTime() / 1000,
    )
    const item = makeMergedV2({
      sortName: 'a.eth',
      sortExpiry: BigInt(tenDaysFromNow),
    })
    const meta = mergedRowMetadata(item, null)
    expect(meta.expiringSoon).toBe(true)
    expect(meta.daysUntilExpiry).toBe(10)
  })

  it('labels zero expiry timestamps as non-expiring', () => {
    const item = makeMergedV1({
      sortName: 'pokemon.fgeorgescu.eth',
      sortExpiry: 0n,
    })

    const meta = mergedRowMetadata(item, null)

    expect(meta.expiryDate).toBeNull()
    expect(meta.formattedExpiryDate).toBe('Does not expire')
    expect(meta.daysUntilExpiry).toBeNull()
  })

  it('uses reminder CTA for names expiring more than 7 days out', () => {
    const tenDaysFromNow = Math.floor(
      new Date('2024-01-11T00:00:00Z').getTime() / 1000,
    )
    const item = makeMergedV2({
      sortName: 'remind.eth',
      sortExpiry: BigInt(tenDaysFromNow),
    })
    const meta = mergedRowMetadata(item, null)
    expect(meta.expiryCta).toBe('remindMe')
  })

  it('uses renew CTA for names expiring within 7 days', () => {
    const sevenDaysFromNow = Math.floor(
      new Date('2024-01-08T00:00:00Z').getTime() / 1000,
    )
    const item = makeMergedV2({
      sortName: 'renew.eth',
      sortExpiry: BigInt(sevenDaysFromNow),
    })
    const meta = mergedRowMetadata(item, null)
    expect(meta.expiryCta).toBe('renew')
  })

  it('flags grace period metadata for expired v2 names', () => {
    const expired = Math.floor(
      new Date('2023-12-20T00:00:00Z').getTime() / 1000,
    )
    const item = makeMergedV2({
      sortName: 'grace.eth',
      sortExpiry: BigInt(expired),
    })
    const meta = mergedRowMetadata(item, null)
    expect(meta.isInGrace).toBe(true)
    expect(meta.useDefaultAvatar).toBe(true)
    expect(meta.showProminentRenew).toBe(true)
    expect(meta.expiryCta).toBe('renew')
    expect(meta.displayExpiryDate?.getTime()).toBeGreaterThan(
      meta.expiryDate?.getTime() ?? 0,
    )
  })
})
