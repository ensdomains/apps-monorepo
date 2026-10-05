import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRemoveUserPlan, type NameRoleHolder } from './removeUserPlan'

const OWNER = '0xAAaAAAaaAaAAaAAAAaAaaAAaAaaaAaaaAAaAAaaA' as Address
const MANAGER = '0xBbBBbbBBbbBBBbbBBbBbbbbBbBbbBBbbBBbBbBBb' as Address
const OTHER = '0xcCCccCCCCCcCcCCCcCcccCcCcCCCCccCcccCccCC' as Address

/**
 * What the `.eth` registrar grants a 2LD owner at registration: the three manager
 * roles plus admin over the two it may delegate, plus the transfer role the
 * ERC-1155 gate reads. Only the first three show up in the sheet's grid.
 */
const OWNER_ROLES = [
  'ROLE_RENEW',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_SUBREGISTRY',
  'ROLE_CAN_TRANSFER_ADMIN',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_SET_SUBREGISTRY_ADMIN',
] as Role[]

/** The registrar grants no `ROLE_RENEW_ADMIN`, so the owner can't revoke its own renew. */
const OWNER_ADMIN_ROLES = new Set([
  'ROLE_CAN_TRANSFER_ADMIN',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_SET_SUBREGISTRY_ADMIN',
] as Role[])

const adminRoles = (...roles: string[]) => new Set(roles as Role[])

const holders = (
  entries: readonly {
    readonly account: Address
    readonly roles: readonly Role[]
  }[],
): readonly NameRoleHolder[] => entries

/** Nobody holds roles at the registry root, as on a `.eth` 2LD. */
const NO_ROOT_ADMINS = new Set<Role>()

describe('buildRemoveUserPlan', () => {
  describe("the owner's own row on a .eth 2LD", () => {
    const plan = buildRemoveUserPlan({
      account: OWNER,
      currentRoles: OWNER_ROLES,
      callerAdminRoles: OWNER_ADMIN_ROLES,
      holders: holders([{ account: OWNER, roles: OWNER_ROLES }]),
      ownerAddress: OWNER,
      rootAdminRoles: NO_ROOT_ADMINS,
    })

    it('never encodes ROLE_CAN_TRANSFER_ADMIN', () => {
      expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    })

    it('revokes everything else the owner can revoke', () => {
      expect(plan.rolesToRevoke).toEqual([
        'ROLE_SET_RESOLVER',
        'ROLE_SET_SUBREGISTRY',
        'ROLE_SET_RESOLVER_ADMIN',
        'ROLE_SET_SUBREGISTRY_ADMIN',
      ])
    })

    it('keeps ROLE_RENEW back rather than reverting the whole removal', () => {
      expect(plan.unauthorizedRoles).toEqual(['ROLE_RENEW'])
    })

    it('flags the sole-admin roles it does revoke as unrecoverable', () => {
      expect(plan.lockoutRoles).toEqual([
        'ROLE_SET_RESOLVER_ADMIN',
        'ROLE_SET_SUBREGISTRY_ADMIN',
      ])
    })
  })

  describe('the transfer role', () => {
    it('stays with the owner even when another account holds it too', () => {
      // The gate reads the role on the token owner, so a second holder does not
      // keep the name transferable.
      const plan = buildRemoveUserPlan({
        account: OWNER,
        currentRoles: OWNER_ROLES,
        callerAdminRoles: OWNER_ADMIN_ROLES,
        holders: holders([
          { account: OWNER, roles: OWNER_ROLES },
          { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
        ]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
      // Not the last holder, so the dialog must not say it is.
      expect(plan.transferRoleHold).toBe('owner')
    })

    it('says the owner is its last holder only when nobody else holds it', () => {
      const plan = buildRemoveUserPlan({
        account: OWNER,
        currentRoles: OWNER_ROLES,
        callerAdminRoles: OWNER_ADMIN_ROLES,
        holders: holders([{ account: OWNER, roles: OWNER_ROLES }]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.transferRoleHold).toBe('last-holder')
    })

    it('keeps it, without claiming ownership, while the owner is unknown', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: holders([
          { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
          { account: OWNER, roles: OWNER_ROLES },
        ]),
        ownerAddress: undefined,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
      expect(plan.transferRoleHold).toBe('owner-unknown')
    })

    it('stays with a non-owner who is its last holder on the name', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: holders([
          { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
          { account: OWNER, roles: ['ROLE_SET_RESOLVER'] as Role[] },
        ]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).toEqual([])
      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    })

    it('is revocable from a non-owner while the owner still holds it', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: holders([
          { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
          { account: OWNER, roles: OWNER_ROLES },
        ]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
      expect(plan.frozenRoles).toEqual([])
      expect(plan.lockoutRoles).toEqual([])
    })

    it('compares the owner and other holders case-insensitively', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER.toLowerCase() as Address,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: holders([
          {
            account: MANAGER.toUpperCase().replace('0X', '0x') as Address,
            roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
          },
          { account: OWNER, roles: OWNER_ROLES },
        ]),
        ownerAddress: OWNER.toLowerCase() as Address,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    })

    it('is kept when the holder list has not loaded yet', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: undefined,
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    })

    it('is kept when the owner is not known yet', () => {
      const plan = buildRemoveUserPlan({
        account: MANAGER,
        currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
        holders: holders([
          { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
          { account: OWNER, roles: OWNER_ROLES },
        ]),
        ownerAddress: undefined,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    })
  })

  describe('a delegated manager removing another row', () => {
    const managerRoles = ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'] as Role[]

    it('revokes only the roles it holds the admin for', () => {
      const plan = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: managerRoles,
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([
          { account: OWNER, roles: OWNER_ROLES },
          { account: OTHER, roles: managerRoles },
        ]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).toEqual(['ROLE_SET_RESOLVER'])
      expect(plan.unauthorizedRoles).toEqual(['ROLE_SET_SUBREGISTRY'])
      expect(plan.lockoutRoles).toEqual([])
    })

    it('revokes a delegated admin role the owner still holds', () => {
      const delegated = [
        'ROLE_SET_RESOLVER',
        'ROLE_SET_RESOLVER_ADMIN',
      ] as Role[]

      const plan = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: delegated,
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([
          { account: OWNER, roles: OWNER_ROLES },
          { account: OTHER, roles: delegated },
        ]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(plan.rolesToRevoke).toEqual([
        'ROLE_SET_RESOLVER',
        'ROLE_SET_RESOLVER_ADMIN',
      ])
      expect(plan.lockoutRoles).toEqual([])
    })
  })

  describe('registry-root authority', () => {
    const soleDelegated = ['ROLE_SET_RESOLVER_ADMIN'] as Role[]

    it('counts towards what the caller may revoke', () => {
      // `_getRevokableRoles` runs on `_effectiveRoles`, which ORs the caller's
      // root roles over its per-name ones.
      const plan = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'] as Role[],
        callerAdminRoles: adminRoles(
          'ROLE_SET_RESOLVER_ADMIN',
          'ROLE_SET_SUBREGISTRY_ADMIN',
        ),
        holders: holders([{ account: OTHER, roles: soleDelegated }]),
        ownerAddress: OWNER,
        rootAdminRoles: adminRoles('ROLE_SET_SUBREGISTRY_ADMIN'),
      })

      expect(plan.rolesToRevoke).toEqual([
        'ROLE_SET_RESOLVER',
        'ROLE_SET_SUBREGISTRY',
      ])
      expect(plan.unauthorizedRoles).toEqual([])
    })

    it('stops a last-admin revoke counting as a lockout', () => {
      const withRootHolder = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: soleDelegated,
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([{ account: OTHER, roles: soleDelegated }]),
        ownerAddress: OWNER,
        rootAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
      })

      expect(withRootHolder.rolesToRevoke).toEqual(['ROLE_SET_RESOLVER_ADMIN'])
      expect(withRootHolder.lockoutRoles).toEqual([])

      const withoutRootHolder = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: soleDelegated,
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([{ account: OTHER, roles: soleDelegated }]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      })

      expect(withoutRootHolder.lockoutRoles).toEqual([
        'ROLE_SET_RESOLVER_ADMIN',
      ])
    })

    it('is flagged unknown, not empty, when the root could not be read', () => {
      const plan = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: soleDelegated,
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([{ account: OTHER, roles: soleDelegated }]),
        ownerAddress: OWNER,
        rootAdminRoles: undefined,
      })

      // Still warned about, since a root holder can't be confirmed, but flagged
      // so the copy says it is unconfirmed rather than certain.
      expect(plan.lockoutRoles).toEqual(['ROLE_SET_RESOLVER_ADMIN'])
      expect(plan.isRootAuthorityUnknown).toBe(true)
    })
  })

  it('drops ROLE_WAS_RESERVED, which has no admin and cannot be revoked', () => {
    const reserved = ['ROLE_SET_RESOLVER', 'ROLE_WAS_RESERVED'] as Role[]

    const plan = buildRemoveUserPlan({
      account: OWNER,
      currentRoles: reserved,
      callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
      holders: holders([{ account: OWNER, roles: reserved }]),
      ownerAddress: OWNER,
      rootAdminRoles: NO_ROOT_ADMINS,
    })

    expect(plan.rolesToRevoke).toEqual(['ROLE_SET_RESOLVER'])
    expect(plan.unauthorizedRoles).toEqual(['ROLE_WAS_RESERVED'])
  })

  it('returns empty buckets for a row with no roles', () => {
    expect(
      buildRemoveUserPlan({
        account: OWNER,
        currentRoles: [],
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([]),
        ownerAddress: OWNER,
        rootAdminRoles: NO_ROOT_ADMINS,
      }),
    ).toEqual({
      rolesToRevoke: [],
      frozenRoles: [],
      transferRoleHold: null,
      unauthorizedRoles: [],
      lockoutRoles: [],
      isRootAuthorityUnknown: false,
    })
  })

  it('revokes nothing dangerous when no account is selected', () => {
    const plan = buildRemoveUserPlan({
      account: undefined,
      currentRoles: OWNER_ROLES,
      callerAdminRoles: OWNER_ADMIN_ROLES,
      holders: holders([{ account: OWNER, roles: OWNER_ROLES }]),
      ownerAddress: OWNER,
      rootAdminRoles: NO_ROOT_ADMINS,
    })

    expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
  })
})
