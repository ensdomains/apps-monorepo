import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { RootRoleHolder } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import {
  computeRoleDiff,
  getRemovableRoles,
  getSoleAdminRoles,
  isAdminRole,
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
  it.each([
    {
      case: 'revoking the only upgrader',
      holders: [
        { account: ALICE, roles: ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN'] },
      ],
      toRevoke: ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN'],
      expected: true,
    },
    {
      case: 'the account keeps the admin role',
      holders: [
        { account: ALICE, roles: ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN'] },
      ],
      toRevoke: ['ROLE_UPGRADE'],
      expected: false,
    },
    {
      case: 'another account can still upgrade',
      holders: [
        { account: ALICE, roles: ['ROLE_UPGRADE'] },
        { account: BOB, roles: ['ROLE_UPGRADE_ADMIN'] },
      ],
      toRevoke: ['ROLE_UPGRADE'],
      expected: false,
    },
    {
      case: 'no upgrade role is revoked',
      holders: [{ account: ALICE, roles: ['ROLE_UPGRADE', 'ROLE_RENEW'] }],
      toRevoke: ['ROLE_RENEW'],
      expected: false,
    },
  ] as const)('$case: $expected', ({ holders, toRevoke, expected }) => {
    expect(
      isUpgradeRevokeBlocked({
        isPendingUpgrade: true,
        rows: rows(
          holders.map(({ account, roles }) => ({ account, roles: [...roles] })),
        ),
        account: ALICE.toLowerCase() as Address,
        toRevoke,
      }),
    ).toBe(expected)
  })

  it.each([
    { isPendingUpgrade: undefined, holders: undefined, expected: true },
    { isPendingUpgrade: true, holders: undefined, expected: true },
    { isPendingUpgrade: false, holders: undefined, expected: false },
  ])(
    'pending upgrade $isPendingUpgrade and unknown holders: $expected',
    ({ isPendingUpgrade, holders, expected }) => {
      expect(
        isUpgradeRevokeBlocked({
          isPendingUpgrade,
          rows: holders,
          account: ALICE,
          toRevoke: ['ROLE_UPGRADE_ADMIN'],
        }),
      ).toBe(expected)
    },
  )
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
