import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import {
  type DashboardName,
  isListedName,
  mergeDashboardNames,
  toDashboardName,
  toGraceName,
} from './dashboardNames'

const OWNER = '0x1111111111111111111111111111111111111111'
const NOW = new Date('2026-10-06T00:00:00Z')
const nowSeconds = NOW.getTime() / 1000

const summary = (overrides: Partial<NameSummary> = {}): NameSummary => ({
  name: 'alice.eth',
  displayName: 'alice.eth',
  namehash: '0x01',
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  registeredAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
})

const lapsed = (overrides: Partial<AddressName> = {}): AddressName => ({
  name: 'grace.eth',
  display_name: 'grace.eth',
  namespace: 'ens',
  namehash: '0x02',
  registration_status: 'released',
  authority: 'ens_v2',
  expires_at: String(nowSeconds - 86_400 * 3),
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: { owner: OWNER, release_kind: 'expired' },
  ...overrides,
})

const dashboardName = (
  overrides: Partial<DashboardName> = {},
): DashboardName => ({
  key: '0x01',
  name: 'alice.eth',
  protocol: 'v2',
  expiryDate: 100,
  createdAt: null,
  nameRoles: ['owner'],
  isLapsed: false,
  ...overrides,
})

describe('toDashboardName', () => {
  it('maps registrant to owner and keeps manager', () => {
    expect(
      toDashboardName(summary({ relations: ['registrant', 'manager'] }))
        .nameRoles,
    ).toEqual(['owner', 'manager'])
    expect(
      toDashboardName(summary({ relations: ['manager'] })).nameRoles,
    ).toEqual(['manager'])
  })

  it('renders a name without an expiry as non-expiring', () => {
    expect(toDashboardName(summary({ expiresAt: null })).expiryDate).toBe(0)
  })
})

describe('isListedName', () => {
  it.each([
    { name: 'alice.eth', registrationStatus: 'active', listed: true },
    { name: 'alice.eth', registrationStatus: 'wrapped', listed: true },
    { name: 'alice.eth', registrationStatus: 'released', listed: false },
    { name: 'alice.eth', registrationStatus: 'unregistered', listed: false },
    { name: 'abc.addr.reverse', registrationStatus: 'active', listed: false },
  ] as const)('$name $registrationStatus listed: $listed', ({
    name,
    registrationStatus,
    listed,
  }) => {
    expect(isListedName(summary({ name, registrationStatus }))).toBe(listed)
  })
})

describe('toGraceName', () => {
  it('lists an expired ENSv2 .eth name of this owner without roles', () => {
    expect(toGraceName(lapsed(), OWNER, NOW)).toEqual({
      key: '0x02',
      name: 'grace.eth',
      protocol: 'v2',
      expiryDate: nowSeconds - 86_400 * 3,
      createdAt: null,
      nameRoles: [],
      isLapsed: true,
    })
  })

  it.each([
    { case: 'an ENSv1 name', row: lapsed({ authority: 'ens_v1' }) },
    { case: 'a subname', row: lapsed({ name: 'sub.grace.eth' }) },
    {
      case: 'another owner',
      row: lapsed({
        lapsed_registration: {
          owner: '0x2222222222222222222222222222222222222222',
          release_kind: 'expired',
        },
      }),
    },
    {
      case: 'a burned registration',
      row: lapsed({
        lapsed_registration: { owner: OWNER, release_kind: 'burned' },
      }),
    },
    {
      case: 'a name past grace',
      row: lapsed({ expires_at: String(nowSeconds - 86_400 * 60) }),
    },
  ])('skips $case', ({ row }) => {
    expect(toGraceName(row, OWNER, NOW)).toBeNull()
  })
})

describe('mergeDashboardNames', () => {
  it('unions the roles each address holds on a name', () => {
    expect(
      mergeDashboardNames([
        dashboardName({ nameRoles: ['manager'] }),
        dashboardName({ nameRoles: ['owner'] }),
        dashboardName({ key: '0x02', name: 'bob.eth' }),
      ]),
    ).toEqual([
      dashboardName({ nameRoles: ['owner', 'manager'] }),
      dashboardName({ key: '0x02', name: 'bob.eth' }),
    ])
  })

  it('prefers a current row over a grace row for the same name', () => {
    expect(
      mergeDashboardNames([
        dashboardName({ expiryDate: 50, nameRoles: [] }),
        dashboardName({ expiryDate: 200, nameRoles: ['owner'] }),
      ]),
    ).toEqual([dashboardName({ expiryDate: 200, nameRoles: ['owner'] })])
  })
})
