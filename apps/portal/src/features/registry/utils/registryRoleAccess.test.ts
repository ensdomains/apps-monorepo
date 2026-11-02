import {
  decodeRoleCounts,
  type Role,
  registryRoles,
} from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { RootRoleHolder } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import {
  computeRoleDiff,
  getRemovableRoles,
  getSoleAdminRoles,
  isAdminRole,
  isRestrictedGrantBlocked,
  isUpgradeRevokeBlocked,
  toAdminRole,
} from './registryRoleAccess'

const ALICE = '0xAAaAAAaaAaAAaAAAAaAaaAAaAaaaAaaaAAaAAaaA' as Address
const BOB = '0xBbBBbbBBbbBBBbbBBbBbbbbBbBbbBBbbBBbBbBBb' as Address

const rows = (
  entries: Array<{ account: Address; roles: Role[] }>,
): RootRoleHolder[] => entries

describe('isAdminRole', () => {
  it('detects the _ADMIN suffix', () => {
    expect(isAdminRole('ROLE_REGISTRAR_ADMIN' as Role)).toBe(true)
    expect(isAdminRole('ROLE_REGISTRAR' as Role)).toBe(false)
  })
})

describe('toAdminRole', () => {
  it('appends _ADMIN to a base role', () => {
    expect(toAdminRole('ROLE_SET_RESOLVER' as Role)).toBe(
      'ROLE_SET_RESOLVER_ADMIN',
    )
  })

  it('is a no-op for an already-admin role', () => {
    expect(toAdminRole('ROLE_SET_RESOLVER_ADMIN' as Role)).toBe(
      'ROLE_SET_RESOLVER_ADMIN',
    )
  })
})

describe('getRemovableRoles', () => {
  it('keeps roles whose _ADMIN the caller holds', () => {
    const callerAdmin = new Set<Role>([
      'ROLE_REGISTRAR_ADMIN',
      'ROLE_SET_RESOLVER_ADMIN',
    ] as Role[])
    const current = [
      'ROLE_REGISTRAR',
      'ROLE_SET_RESOLVER',
      'ROLE_RENEW', // caller lacks ROLE_RENEW_ADMIN
    ] as Role[]
    expect(getRemovableRoles(current, callerAdmin)).toEqual([
      'ROLE_REGISTRAR',
      'ROLE_SET_RESOLVER',
    ])
  })

  it('treats an admin role as removable when its own admin key is held', () => {
    const callerAdmin = new Set<Role>(['ROLE_REGISTRAR_ADMIN'] as Role[])
    expect(
      getRemovableRoles(['ROLE_REGISTRAR_ADMIN'] as Role[], callerAdmin),
    ).toEqual(['ROLE_REGISTRAR_ADMIN'])
  })

  it('returns empty when the caller holds no admin roles', () => {
    expect(getRemovableRoles(['ROLE_REGISTRAR'] as Role[], new Set())).toEqual(
      [],
    )
  })
})

describe('getSoleAdminRoles', () => {
  it('returns admin roles only this account holds', () => {
    const data = rows([
      {
        account: ALICE,
        roles: ['ROLE_REGISTRAR_ADMIN', 'ROLE_SET_RESOLVER_ADMIN'] as Role[],
      },
      { account: BOB, roles: ['ROLE_SET_RESOLVER_ADMIN'] as Role[] },
    ])
    // ALICE shares ROLE_SET_RESOLVER_ADMIN with BOB, but is the sole
    // ROLE_REGISTRAR_ADMIN holder.
    expect([...getSoleAdminRoles(data, ALICE)]).toEqual([
      'ROLE_REGISTRAR_ADMIN',
    ])
  })

  it('ignores non-admin roles', () => {
    const data = rows([{ account: ALICE, roles: ['ROLE_REGISTRAR'] as Role[] }])
    expect(getSoleAdminRoles(data, ALICE).size).toBe(0)
  })

  it('matches the other holder case-insensitively', () => {
    const data = rows([
      { account: ALICE, roles: ['ROLE_REGISTRAR_ADMIN'] as Role[] },
      {
        account: ALICE.toLowerCase() as Address,
        roles: ['ROLE_REGISTRAR_ADMIN'] as Role[],
      },
    ])
    // The "other" row is the same account in different casing → still sole.
    expect([...getSoleAdminRoles(data, ALICE)]).toEqual([
      'ROLE_REGISTRAR_ADMIN',
    ])
  })

  it('returns empty for missing inputs', () => {
    expect(getSoleAdminRoles(undefined, ALICE).size).toBe(0)
    expect(getSoleAdminRoles([], undefined).size).toBe(0)
  })
})

describe('isUpgradeRevokeBlocked', () => {
  type Params = Parameters<typeof isUpgradeRevokeBlocked>[0]
  const counts = (upgrade: number, admin: number) => ({
    ...decodeRoleCounts(0n, registryRoles),
    ROLE_UPGRADE: upgrade,
    ROLE_UPGRADE_ADMIN: admin,
  })
  const blocked = (overrides: Partial<Params> = {}) =>
    isUpgradeRevokeBlocked({
      isPendingUpgrade: true,
      rootRoleCounts: counts(1, 1),
      accountRoles: ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN'],
      toGrant: [],
      toRevoke: ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN'],
      ...overrides,
    })

  it.each<{
    readonly case: string
    readonly overrides: Partial<Params>
    readonly expected: boolean
  }>([
    { case: 'the last holder revokes both', overrides: {}, expected: true },
    {
      case: 'the account keeps the admin role',
      overrides: { toRevoke: ['ROLE_UPGRADE'] },
      expected: false,
    },
    {
      case: 'another account holds it on-chain',
      overrides: { rootRoleCounts: counts(2, 1) },
      expected: false,
    },
    {
      case: 'the admin role is swapped for the role in one edit',
      overrides: {
        accountRoles: ['ROLE_UPGRADE_ADMIN'],
        rootRoleCounts: counts(0, 1),
        toGrant: ['ROLE_UPGRADE'],
        toRevoke: ['ROLE_UPGRADE_ADMIN'],
      },
      expected: false,
    },
    {
      case: 'no upgrade role is revoked',
      overrides: { toRevoke: ['ROLE_RENEW'] },
      expected: false,
    },
    {
      case: 'the registry is not pending an upgrade',
      overrides: { isPendingUpgrade: false },
      expected: false,
    },
    {
      case: 'the registry is unchecked',
      overrides: { isPendingUpgrade: undefined },
      expected: true,
    },
    {
      case: 'the counts are unknown',
      overrides: { rootRoleCounts: undefined },
      expected: true,
    },
    {
      case: "the account's roles are unknown",
      overrides: { accountRoles: undefined },
      expected: true,
    },
  ])('$case: $expected', ({ overrides, expected }) => {
    expect(blocked(overrides)).toBe(expected)
  })
})

describe('isRestrictedGrantBlocked', () => {
  it.each<{
    readonly case: string
    readonly isPendingUpgrade: boolean | undefined
    readonly toGrant: readonly Role[]
    readonly expected: boolean
  }>([
    {
      case: 'registrar on a registry pending an upgrade',
      isPendingUpgrade: true,
      toGrant: ['ROLE_RENEW', 'ROLE_REGISTRAR'],
      expected: true,
    },
    {
      case: 'the unregister admin role',
      isPendingUpgrade: true,
      toGrant: ['ROLE_UNREGISTER_ADMIN'],
      expected: true,
    },
    {
      case: 'registrar on an unchecked registry',
      isPendingUpgrade: undefined,
      toGrant: ['ROLE_REGISTRAR'],
      expected: true,
    },
    {
      case: 'registrar on a registry not pending an upgrade',
      isPendingUpgrade: false,
      toGrant: ['ROLE_REGISTRAR'],
      expected: false,
    },
    {
      case: 'other roles',
      isPendingUpgrade: true,
      toGrant: ['ROLE_RENEW', 'ROLE_SET_RESOLVER'],
      expected: false,
    },
  ])('$case: $expected', ({ isPendingUpgrade, toGrant, expected }) => {
    expect(isRestrictedGrantBlocked({ isPendingUpgrade, toGrant })).toBe(
      expected,
    )
  })
})

describe('computeRoleDiff', () => {
  it('splits added/removed roles', () => {
    const current = new Set<Role>(['ROLE_REGISTRAR', 'ROLE_RENEW'] as Role[])
    const selected = new Set<Role>([
      'ROLE_REGISTRAR',
      'ROLE_SET_RESOLVER',
    ] as Role[])
    const { toGrant, toRevoke } = computeRoleDiff(current, selected)
    expect(toGrant).toEqual(['ROLE_SET_RESOLVER'])
    expect(toRevoke).toEqual(['ROLE_RENEW'])
  })

  it('returns empty diffs when the sets are equal', () => {
    const set = new Set<Role>(['ROLE_REGISTRAR'] as Role[])
    const { toGrant, toRevoke } = computeRoleDiff(set, new Set(set))
    expect(toGrant).toEqual([])
    expect(toRevoke).toEqual([])
  })
})
