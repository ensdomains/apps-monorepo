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

const adminRoles = (...roles: string[]) => new Set(roles as Role[])

const holders = (
  entries: Array<{ account: Address; roles: Role[] }>,
): NameRoleHolder[] => entries

describe('buildRemoveUserPlan', () => {
  describe("the owner's own row on a .eth 2LD", () => {
    const plan = buildRemoveUserPlan({
      account: OWNER,
      currentRoles: OWNER_ROLES,
      // The registrar grants no ROLE_RENEW_ADMIN, so the owner cannot revoke
      // its own ROLE_RENEW.
      callerAdminRoles: adminRoles(
        'ROLE_CAN_TRANSFER_ADMIN',
        'ROLE_SET_RESOLVER_ADMIN',
        'ROLE_SET_SUBREGISTRY_ADMIN',
      ),
      holders: holders([{ account: OWNER, roles: OWNER_ROLES }]),
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

  it('keeps the transfer role when holders have not loaded yet', () => {
    const plan = buildRemoveUserPlan({
      account: OWNER,
      currentRoles: OWNER_ROLES,
      callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
      holders: undefined,
    })

    expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
    expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
  })

  it('revokes the transfer role when another holder can grant it back', () => {
    const plan = buildRemoveUserPlan({
      account: MANAGER,
      currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
      callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
      holders: holders([
        { account: MANAGER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
        { account: OWNER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
      ]),
    })

    expect(plan.rolesToRevoke).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    expect(plan.frozenRoles).toEqual([])
    expect(plan.lockoutRoles).toEqual([])
  })

  it('matches the other holder case-insensitively', () => {
    const plan = buildRemoveUserPlan({
      account: MANAGER.toLowerCase() as Address,
      currentRoles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
      callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
      holders: holders([
        {
          account: MANAGER.toUpperCase().replace('0X', '0x') as Address,
          roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[],
        },
        { account: OWNER, roles: ['ROLE_CAN_TRANSFER_ADMIN'] as Role[] },
      ]),
    })

    expect(plan.rolesToRevoke).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
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
      })

      expect(plan.rolesToRevoke).toEqual(['ROLE_SET_RESOLVER'])
      expect(plan.unauthorizedRoles).toEqual(['ROLE_SET_SUBREGISTRY'])
      expect(plan.lockoutRoles).toEqual([])
    })

    it('revokes a delegated admin role the owner still holds', () => {
      const plan = buildRemoveUserPlan({
        account: OTHER,
        currentRoles: [
          'ROLE_SET_RESOLVER',
          'ROLE_SET_RESOLVER_ADMIN',
        ] as Role[],
        callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
        holders: holders([
          { account: OWNER, roles: OWNER_ROLES },
          {
            account: OTHER,
            roles: ['ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN'] as Role[],
          },
        ]),
      })

      expect(plan.rolesToRevoke).toEqual([
        'ROLE_SET_RESOLVER',
        'ROLE_SET_RESOLVER_ADMIN',
      ])
      expect(plan.lockoutRoles).toEqual([])
    })
  })

  it('drops ROLE_WAS_RESERVED, which has no admin and cannot be revoked', () => {
    const plan = buildRemoveUserPlan({
      account: OWNER,
      currentRoles: ['ROLE_SET_RESOLVER', 'ROLE_WAS_RESERVED'] as Role[],
      callerAdminRoles: adminRoles('ROLE_SET_RESOLVER_ADMIN'),
      holders: holders([
        {
          account: OWNER,
          roles: ['ROLE_SET_RESOLVER', 'ROLE_WAS_RESERVED'] as Role[],
        },
      ]),
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
      }),
    ).toEqual({
      rolesToRevoke: [],
      frozenRoles: [],
      unauthorizedRoles: [],
      lockoutRoles: [],
    })
  })

  it('revokes nothing when no account is selected', () => {
    const plan = buildRemoveUserPlan({
      account: undefined,
      currentRoles: OWNER_ROLES,
      callerAdminRoles: adminRoles('ROLE_CAN_TRANSFER_ADMIN'),
      holders: holders([{ account: OWNER, roles: OWNER_ROLES }]),
    })

    expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
  })
})
