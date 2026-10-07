import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DashboardName,
  type MergedItem,
  mergedRowMetadata,
  toMergedItems,
} from './mergedNames'

const makeName = (overrides: Partial<DashboardName> = {}): DashboardName => ({
  key: '0x01',
  name: 'alice.eth',
  protocol: 'v2',
  expiryDate: 100n,
  servedExpiry: null,
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

describe('toMergedItems', () => {
  it('keeps the order it is given and marks only eligible ENSv1 names for upgrade', () => {
    const items = toMergedItems(
      [
        makeName({ key: '0x2', name: 'zeta.eth' }),
        makeName({ key: '0x1', name: 'alpha.eth', protocol: 'v1' }),
        makeName({ key: '0x3', name: 'beta.eth', protocol: 'v1' }),
      ],
      new Set(['0x1', '0x2']),
    )

    expect(
      items.map(({ sortName, kind, isMigrationEligible }) => [
        sortName,
        kind,
        isMigrationEligible,
      ]),
    ).toEqual([
      ['zeta.eth', 'v2', false],
      ['alpha.eth', 'v1', true],
      ['beta.eth', 'v1', false],
    ])
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
