import type { AddressNameRow } from '@ens-apps/bigname'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addressNameExpirySeconds,
  compareDashboardNames,
  type DashboardName,
  dashboardRowMetadata,
  filterAndSortDashboardNames,
  getAddressNameRoles,
  isListedAddressName,
  mergeAddressNameRows,
  protocolForAuthority,
  toDashboardName,
} from './dashboardNames'

const OWNER = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'

const row = (overrides: Partial<AddressNameRow> = {}): AddressNameRow => ({
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: `0x${overrides.name ?? 'alice.eth'}`,
  relations: ['owner'],
  is_primary: false,
  authority: 'ens_v2',
  registration_status: 'active',
  expires_at: '2030-01-01T00:00:00Z',
  ...overrides,
})

const grant = (address: string, powers: readonly string[]) => ({
  address: address as `0x${string}`,
  grants: [
    {
      grant_scope: { kind: 'registration' as const, detail: {} },
      powers: powers as never,
    },
  ],
})

const name = (
  overrides: Partial<DashboardName> & Pick<DashboardName, 'name'>,
): DashboardName => ({
  key: `0x${overrides.name}`,
  protocol: 'v2',
  expiryDate: null,
  createdAt: null,
  nameRoles: ['owner'],
  ...overrides,
})

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('protocolForAuthority', () => {
  it('treats ens_v0 and ens_v1 as v1 and only ens_v2 as v2', () => {
    expect(protocolForAuthority('ens_v0')).toBe('v1')
    expect(protocolForAuthority('ens_v1')).toBe('v1')
    expect(protocolForAuthority('ens_v2')).toBe('v2')
    expect(protocolForAuthority(undefined)).toBe('v1')
  })
})

describe('isListedAddressName', () => {
  it('drops released and unregistered rows', () => {
    expect(isListedAddressName(row({ registration_status: 'active' }))).toBe(
      true,
    )
    expect(isListedAddressName(row({ registration_status: 'wrapped' }))).toBe(
      true,
    )
    expect(
      isListedAddressName(row({ registration_status: 'registered' })),
    ).toBe(true)
    expect(isListedAddressName(row({ registration_status: 'released' }))).toBe(
      false,
    )
    expect(
      isListedAddressName(row({ registration_status: 'unregistered' })),
    ).toBe(false)
  })
})

describe('addressNameExpirySeconds', () => {
  it('parses expires_at', () => {
    expect(
      addressNameExpirySeconds({ expires_at: '2030-01-01T00:00:00+00:00' }),
    ).toBe(seconds('2030-01-01T00:00:00Z'))
  })

  it('reads a held name without expires_at as not expiring', () => {
    expect(addressNameExpirySeconds({ registration_status: 'active' })).toBe(0)
  })

  it('leaves the expiry unknown when the row has no status', () => {
    expect(addressNameExpirySeconds({})).toBeNull()
  })
})

describe('getAddressNameRoles', () => {
  it('maps owner and registrant to Owner, manager to Manager', () => {
    expect(
      getAddressNameRoles(row({ relations: ['registrant'] }), [OWNER]),
    ).toEqual(['owner'])
    expect(
      getAddressNameRoles(
        row({ relations: ['registrant', 'owner', 'manager'] }),
        [OWNER],
      ),
    ).toEqual(['owner', 'manager'])
    expect(
      getAddressNameRoles(row({ relations: ['manager'] }), [OWNER]),
    ).toEqual(['manager'])
  })

  it('adds Manager for an ENSv2 grant held by one of the addresses', () => {
    expect(
      getAddressNameRoles(
        row({ role_summary: [grant(OWNER.toUpperCase(), ['set_resolver'])] }),
        [OWNER],
      ),
    ).toEqual(['owner', 'manager'])
  })

  it('ignores grants held by other addresses and ENSv1 grants', () => {
    expect(
      getAddressNameRoles(
        row({ role_summary: [grant(OTHER, ['set_resolver'])] }),
        [OWNER],
      ),
    ).toEqual(['owner'])
    expect(
      getAddressNameRoles(
        row({
          authority: 'ens_v1',
          relations: ['registrant'],
          role_summary: [grant(OWNER, ['registration_control'])],
        }),
        [OWNER],
      ),
    ).toEqual(['owner'])
  })
})

describe('toDashboardName', () => {
  it('maps a row', () => {
    expect(
      toDashboardName(
        row({
          name: 'legacy.eth',
          authority: 'ens_v0',
          relations: ['registrant', 'manager'],
          is_primary: true,
          created_at: '2020-01-01T00:00:00Z',
          registered_at: '2021-01-01T00:00:00Z',
        }),
        [OWNER],
      ),
    ).toEqual({
      key: '0xlegacy.eth',
      name: 'legacy.eth',
      protocol: 'v1',
      expiryDate: seconds('2030-01-01T00:00:00Z'),
      createdAt: seconds('2020-01-01T00:00:00Z'),
      nameRoles: ['owner', 'manager'],
    })
  })
})

describe('mergeAddressNameRows', () => {
  it('collapses one name listed for several addresses', () => {
    const merged = mergeAddressNameRows([
      row({ relations: ['owner'], role_summary: [grant(OWNER, ['renew'])] }),
      row({
        relations: ['manager'],
        is_primary: true,
        role_summary: [grant(OTHER, ['renew'])],
      }),
      row({ name: 'bob.eth' }),
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      relations: ['owner', 'manager'],
      is_primary: true,
    })
    expect(merged[0]?.role_summary).toHaveLength(2)
  })
})

describe('compareDashboardNames', () => {
  const a = name({ name: 'a.eth', expiryDate: 100, createdAt: 30 })
  const b = name({ name: 'b.eth', expiryDate: 200, createdAt: 10 })
  const unknown = name({ name: 'c.eth', expiryDate: null })
  const never = name({ name: 'd.eth', expiryDate: 0 })

  it('sorts by name in either direction', () => {
    expect(compareDashboardNames(a, b, 'name', 'asc')).toBeLessThan(0)
    expect(compareDashboardNames(a, b, 'name', 'desc')).toBeGreaterThan(0)
  })

  it('sorts by expiry, keeping unknown and non-expiring names last', () => {
    expect(compareDashboardNames(a, b, 'expiry', 'asc')).toBeLessThan(0)
    expect(compareDashboardNames(unknown, a, 'expiry', 'asc')).toBe(1)
    expect(compareDashboardNames(unknown, a, 'expiry', 'desc')).toBe(1)
    expect(compareDashboardNames(never, a, 'expiry', 'asc')).toBe(1)
    expect(compareDashboardNames(never, unknown, 'expiry', 'asc')).toBe(0)
  })

  it('sorts by created date', () => {
    expect(compareDashboardNames(a, b, 'created', 'asc')).toBeGreaterThan(0)
  })
})

describe('filterAndSortDashboardNames', () => {
  it('filters by a case-insensitive substring and sorts', () => {
    const names = [
      name({ name: 'charlie.eth' }),
      name({ name: 'sub.alice.eth' }),
      name({ name: 'alice.eth' }),
    ]

    expect(
      filterAndSortDashboardNames({
        names,
        searchQuery: ' ALICE ',
        sortField: 'name',
        sortDir: 'asc',
      }).map((item) => item.name),
    ).toEqual(['alice.eth', 'sub.alice.eth'])
  })
})

describe('dashboardRowMetadata', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flags a v2 name matching primaryLabel as primary', () => {
    const meta = dashboardRowMetadata(name({ name: 'alice.eth' }), {
      primaryLabel: 'alice.eth',
    })
    expect(meta.isPrimary).toBe(true)
    expect(meta.isV1).toBe(false)
  })

  it('never flags v1 names as primary even on label match', () => {
    const meta = dashboardRowMetadata(
      name({ name: 'bob.eth', protocol: 'v1' }),
      { primaryLabel: 'bob.eth' },
    )
    expect(meta.isPrimary).toBe(false)
    expect(meta.isV1).toBe(true)
  })

  it('marks only v1 names as migration eligible', () => {
    expect(
      dashboardRowMetadata(name({ name: 'a.eth', protocol: 'v1' }), {
        isMigrationEligible: true,
      }).isMigrationEligible,
    ).toBe(true)
    expect(
      dashboardRowMetadata(name({ name: 'a.eth' }), {
        isMigrationEligible: true,
      }).isMigrationEligible,
    ).toBe(false)
  })

  it('computes expiringSoon within 30 days', () => {
    const meta = dashboardRowMetadata(
      name({ name: 'a.eth', expiryDate: seconds('2024-01-11T00:00:00Z') }),
    )
    expect(meta.expiringSoon).toBe(true)
    expect(meta.daysUntilExpiry).toBe(10)
    expect(meta.expiryCta).toBe('remindMe')
  })

  it('uses renew CTA for names expiring within 7 days', () => {
    const meta = dashboardRowMetadata(
      name({ name: 'a.eth', expiryDate: seconds('2024-01-08T00:00:00Z') }),
    )
    expect(meta.expiryCta).toBe('renew')
  })

  it('labels a zero expiry as non-expiring', () => {
    const meta = dashboardRowMetadata(
      name({ name: 'pokemon.fgeorgescu.eth', protocol: 'v1', expiryDate: 0 }),
    )
    expect(meta.expiryDate).toBeNull()
    expect(meta.formattedExpiryDate).toBe('Does not expire')
    expect(meta.daysUntilExpiry).toBeNull()
  })

  it('shows an unknown expiry as a dash', () => {
    expect(
      dashboardRowMetadata(name({ name: 'a.eth', expiryDate: null }))
        .formattedExpiryDate,
    ).toBe('—')
  })

  it('flags grace period metadata for expired v2 names', () => {
    const meta = dashboardRowMetadata(
      name({ name: 'grace.eth', expiryDate: seconds('2023-12-20T00:00:00Z') }),
    )
    expect(meta.isInGrace).toBe(true)
    expect(meta.showProminentRenew).toBe(true)
    expect(meta.expiryCta).toBe('renew')
    expect(meta.displayExpiryDate?.getTime()).toBeGreaterThan(
      meta.expiryDate?.getTime() ?? 0,
    )
  })

  it('applies the 90-day v1 grace to a bare v1 lease expiry', () => {
    const meta = dashboardRowMetadata(
      name({
        name: 'old.eth',
        protocol: 'v1',
        expiryDate: seconds('2023-11-01T00:00:00Z'),
      }),
    )
    expect(meta.isInGrace).toBe(true)
    expect(meta.graceEndDate).toEqual(new Date('2024-01-30T00:00:00Z'))
    expect(meta.expiryCta).toBeNull()
  })
})
