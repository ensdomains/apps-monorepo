import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import {
  type AddressNamesChunk,
  compareDashboardNames,
  type DashboardName,
  isAwaitingMigratedNames,
  isListedName,
  mergeDashboardChunks,
  mergeDashboardNames,
  toDashboardName,
  toDashboardPage,
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
  servedExpiry: null,
  registeredAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
})

const lapsed = (overrides: Partial<AddressName> = {}): AddressName => ({
  name: 'grace.eth',
  display_name: 'grace.eth',
  namespace: 'ens',
  namehash: '0x02',
  status: 'expired',
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
  servedExpiry: null,
  expiryDate: 100n,
  createdAt: null,
  nameRoles: ['owner'],
  isLapsed: false,
  ...overrides,
})

describe('toDashboardName', () => {
  it('maps owner, and both a controller and a role holder to manager', () => {
    expect(
      toDashboardName(summary({ relations: ['owner', 'manager'] })).nameRoles,
    ).toEqual(['owner', 'manager'])
    expect(
      toDashboardName(summary({ relations: ['role_holder'] })).nameRoles,
    ).toEqual(['manager'])
    expect(
      toDashboardName(summary({ relations: ['manager'] })).nameRoles,
    ).toEqual(['manager'])
  })

  it('renders a name without an expiry as non-expiring', () => {
    expect(toDashboardName(summary({ expiresAt: null })).expiryDate).toBe(0n)
  })
})

describe('isListedName', () => {
  it.each([
    { name: 'alice.eth', registrationStatus: 'active', listed: true },
    { name: 'alice.eth', registrationStatus: 'expired', listed: true },
    { name: 'alice.eth', registrationStatus: 'released', listed: false },
    { name: 'alice.eth', registrationStatus: 'unregistered', listed: false },
    { name: 'abc.addr.reverse', registrationStatus: 'active', listed: false },
    { name: 'ALICE.eth', registrationStatus: 'active', listed: false },
    { name: 'ali\u00adce.eth', registrationStatus: 'active', listed: false },
    {
      name: `[${'ab'.repeat(32)}].eth`,
      registrationStatus: 'active',
      listed: true,
    },
    {
      name: '\u{1f680}\u{1f680}\u{1f680}.eth',
      registrationStatus: 'active',
      listed: true,
    },
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
      expiryDate: BigInt(nowSeconds - 86_400 * 3),
      servedExpiry: BigInt(nowSeconds - 86_400 * 3),
      createdAt: null,
      nameRoles: [],
      isLapsed: true,
    })
  })

  // Which rows are in grace is tested with the shared grace read.
  it.each([
    { case: 'an un-normalised name', row: lapsed({ name: 'GRACE.eth' }) },
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
        dashboardName({ expiryDate: 50n, nameRoles: [] }),
        dashboardName({ expiryDate: 200n, nameRoles: ['owner'] }),
      ]),
    ).toEqual([dashboardName({ expiryDate: 200n, nameRoles: ['owner'] })])
  })
})

describe('compareDashboardNames', () => {
  const sorted = (
    names: readonly string[],
    field: Parameters<typeof compareDashboardNames>[0] = 'name',
    dir: Parameters<typeof compareDashboardNames>[1] = 'asc',
  ) =>
    names
      .map((name) => dashboardName({ name, key: `0x${name.length}` }))
      .sort(compareDashboardNames(field, dir))
      .map(({ name }) => name)

  it('orders names as bigname does: letters and digits first, punctuation and symbols only breaking ties', () => {
    expect(
      sorted(['fresh-prim.eth', '-new.eth', 'freshname.eth', '1year.eth']),
    ).toEqual(['1year.eth', 'freshname.eth', 'fresh-prim.eth', '-new.eth'])
    expect(
      sorted(['1.ethscan02.eth', '1.\u26b1\u26b1.eth', '1.ensissure.eth']),
    ).toEqual(['1.ensissure.eth', '1.\u26b1\u26b1.eth', '1.ethscan02.eth'])
  })

  it('breaks timestamp ties by namehash ascending in both directions', () => {
    const names = [
      dashboardName({ key: '0x02', name: 'a.eth', servedExpiry: 200n }),
      dashboardName({ key: '0x03', name: 'none.eth', servedExpiry: null }),
      dashboardName({ key: '0x01', name: 'b.eth', servedExpiry: 200n }),
    ]
    expect(
      [...names]
        .sort(compareDashboardNames('expiry', 'asc'))
        .map((n) => n.name),
    ).toEqual(['none.eth', 'b.eth', 'a.eth'])
    expect(
      [...names]
        .sort(compareDashboardNames('expiry', 'desc'))
        .map((n) => n.name),
    ).toEqual(['b.eth', 'a.eth', 'none.eth'])
  })

  it('sorts an expiry past any date after every dated name', () => {
    const names = [
      dashboardName({
        key: '0x01',
        name: 'forever.eth',
        expiryDate: 0n,
        servedExpiry: 9_223_372_036_854_775_807n,
      }),
      dashboardName({ key: '0x02', name: 'dated.eth', servedExpiry: 200n }),
      dashboardName({ key: '0x03', name: 'none.eth', servedExpiry: null }),
    ]
    expect(
      [...names]
        .sort(compareDashboardNames('expiry', 'desc'))
        .map((n) => n.name),
    ).toEqual(['forever.eth', 'dated.eth', 'none.eth'])
  })

  it('sorts a reserved ENSv1 name by its served reservation, not the lease it shows', () => {
    const day = 86_400n
    const names = [
      dashboardName({
        key: '0x01',
        name: 'reserved.eth',
        expiryDate: 1_000n * day,
        servedExpiry: 1_062n * day,
      }),
      dashboardName({
        key: '0x02',
        name: 'unreserved.eth',
        expiryDate: 1_030n * day,
        servedExpiry: 1_030n * day,
      }),
    ]
    expect(
      [...names]
        .sort(compareDashboardNames('expiry', 'asc'))
        .map((n) => n.name),
    ).toEqual(['unreserved.eth', 'reserved.eth'])
  })
})

describe('mergeDashboardChunks', () => {
  const chunk = (
    address: string,
    names: readonly string[],
    nextCursor: string | null,
    extra: Partial<AddressNamesChunk> = {},
  ): AddressNamesChunk => {
    const rows = names.map((name) => dashboardName({ name, key: `0x${name}` }))
    return {
      address,
      names: rows,
      hiddenCount: 0,
      lastRead: rows.at(-1) ?? null,
      nextCursor,
      totalCount: null,
      ...extra,
    }
  }
  const merge = (
    chunks: readonly AddressNamesChunk[],
    graceNames: readonly DashboardName[] = [],
  ) => mergeDashboardChunks({ chunks, graceNames, field: 'name', dir: 'asc' })

  it('interleaves addresses in order once both are read to the end', () => {
    const result = merge([
      chunk('eoa', ['a.eth', 'c.eth'], null),
      chunk('hca', ['b.eth', 'd.eth'], null),
    ])

    expect(result.names.map(({ name }) => name)).toEqual([
      'a.eth',
      'b.eth',
      'c.eth',
      'd.eth',
    ])
    expect(result).toMatchObject({ isComplete: true, total: 4 })
  })

  it('shows a name only once every address with more to read has reached it', () => {
    const result = merge([
      chunk('eoa', ['a.eth', 'm.eth'], 'more', { totalCount: 5 }),
      chunk('hca', ['b.eth', 'z.eth'], null, { totalCount: 2 }),
    ])

    expect(result.names.map(({ name }) => name)).toEqual([
      'a.eth',
      'b.eth',
      'm.eth',
    ])
    expect(result).toMatchObject({ isComplete: false, total: 7 })
  })

  it('holds names back to where an address read only hidden rows', () => {
    const result = merge([
      chunk('eoa', [], 'more', {
        hiddenCount: 1,
        lastRead: dashboardName({ name: 'b.addr.reverse', key: '0xrev' }),
      }),
      chunk('hca', ['a.eth', 'c.eth'], null),
    ])

    expect(result.names.map(({ name }) => name)).toEqual(['a.eth'])
  })

  it('shows nothing while an address with more to read has read no row yet', () => {
    const result = merge([
      chunk('eoa', [], 'more'),
      chunk('hca', ['a.eth'], null),
    ])

    expect(result.names).toEqual([])
  })

  it('merges a name both addresses hold and folds in names in grace', () => {
    const result = merge(
      [
        chunk('eoa', ['a.eth'], null, {
          names: [dashboardName({ name: 'a.eth', nameRoles: ['manager'] })],
        }),
        chunk('hca', ['a.eth'], null, {
          names: [dashboardName({ name: 'a.eth', nameRoles: ['owner'] })],
        }),
      ],
      [
        dashboardName({
          key: '0x09',
          name: 'lapsed.eth',
          nameRoles: [],
          isLapsed: true,
        }),
      ],
    )

    expect(
      result.names.map(({ name, nameRoles }) => [name, nameRoles]),
    ).toEqual([
      ['a.eth', ['owner', 'manager']],
      ['lapsed.eth', []],
    ])
    expect(result.total).toBe(2)
  })

  it('counts bigname totals less the rows it hides, until the read completes', () => {
    const result = merge([
      chunk('eoa', ['a.eth'], 'more', { totalCount: 10, hiddenCount: 1 }),
    ])

    expect(result.total).toBe(9)
  })
})

describe('toDashboardPage', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((label, index) =>
    dashboardName({ key: `0x0${index}`, name: `${label}.eth` }),
  )
  const pageOf = (page: number, total: number) =>
    toDashboardPage({ names, isComplete: true, total }, page, 5)

  it('slices the requested page', () => {
    expect(pageOf(2, 7).names.map(({ name }) => name)).toEqual([
      'f.eth',
      'g.eth',
    ])
  })

  it('shows the last page when the total shrinks below the requested one', () => {
    const result = pageOf(3, 7)

    expect(result.names.map(({ name }) => name)).toEqual(['f.eth', 'g.eth'])
    expect(result.needed).toBe(10)
  })
})

describe('isAwaitingMigratedNames', () => {
  const chunkOf = (names: readonly DashboardName[]): AddressNamesChunk => ({
    address: OWNER,
    names,
    hiddenCount: 0,
    lastRead: names.at(-1) ?? null,
    nextCursor: null,
    totalCount: null,
  })
  const v1 = dashboardName({ key: '0x0a', name: 'agent.eth', protocol: 'v1' })
  const v2 = dashboardName({ key: '0x0b', name: 'agent.eth', protocol: 'v2' })

  it('waits while a just-migrated name is still listed only as ENSv1', () => {
    expect(isAwaitingMigratedNames([chunkOf([v1])], ['agent'])).toBe(true)
    expect(isAwaitingMigratedNames([chunkOf([v1])], ['Agent.eth'])).toBe(true)
  })

  it('stops once bigname lists it as ENSv2, or with nothing migrated', () => {
    expect(isAwaitingMigratedNames([chunkOf([v1, v2])], ['agent'])).toBe(false)
    expect(isAwaitingMigratedNames([chunkOf([v2])], ['agent'])).toBe(false)
    expect(isAwaitingMigratedNames([chunkOf([v1])], [])).toBe(false)
  })

  it('keeps waiting while the name is in neither list', () => {
    expect(isAwaitingMigratedNames([chunkOf([])], ['agent'])).toBe(true)
  })

  it('on the ENSv1 list, waits only until the name leaves it', () => {
    expect(isAwaitingMigratedNames([chunkOf([v1])], ['agent'], 'v1')).toBe(true)
    expect(isAwaitingMigratedNames([chunkOf([])], ['agent'], 'v1')).toBe(false)
  })
})
