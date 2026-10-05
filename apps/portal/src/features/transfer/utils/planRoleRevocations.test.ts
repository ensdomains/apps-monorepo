import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { planRoleRevocations } from './planRoleRevocations'

/** Defaults the sender to holding nothing at the registry root. */
const planFor = (
  params: Omit<Parameters<typeof planRoleRevocations>[0], 'ownerRootRoles'> & {
    ownerRootRoles?: readonly string[]
  },
) => planRoleRevocations({ ownerRootRoles: [], ...params })

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const DELEGATE = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address

/** What a freshly registered 2LD's owner holds on its own resource. */
const OWNER_ADMIN_ROLES = [
  'ROLE_SET_RESOLVER',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_SET_SUBREGISTRY',
  'ROLE_SET_SUBREGISTRY_ADMIN',
  'ROLE_CAN_TRANSFER_ADMIN',
]

describe('planRoleRevocations', () => {
  it('lists a delegate the owner can revoke', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_SET_RESOLVER']]]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.holders).toEqual([
      { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
    ])
    expect(plan.revocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
    ])
    expect(plan.unrevocable).toEqual([])
  })

  // The owner is about to lose the token anyway, and revoking their own roles
  // mid-flow would strip the admin rights the remaining steps run on.
  it('never plans a revoke against the owner', () => {
    const plan = planFor({
      accounts: new Map([[OWNER, OWNER_ADMIN_ROLES]]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.holders).toEqual([])
    expect(plan.revocable).toEqual([])
  })

  it('matches the owner case-insensitively', () => {
    const plan = planFor({
      accounts: new Map([
        [OWNER.toUpperCase().replace('0X', '0x') as Address, ['ROLE_RENEW']],
      ]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.holders).toEqual([])
  })

  // `EnhancedAccessControl._getRevokableRoles` is the caller's admin bits plus
  // their regular counterparts, so a role with no matching admin can't be
  // revoked by this wallet however the toggle is set.
  it('splits a grant into what the owner can and cannot revoke', () => {
    const plan = planFor({
      accounts: new Map([
        [DELEGATE, ['ROLE_SET_RESOLVER', 'ROLE_RENEW', 'ROLE_UNREGISTER']],
      ]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.revocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
    ])
    expect(plan.unrevocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_RENEW', 'ROLE_UNREGISTER'] },
    ])
  })

  // An admin role is revoked by whoever holds that same admin role, not by a
  // further `_ADMIN_ADMIN` that doesn't exist.
  it('revokes an admin role from whoever holds the same admin role', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_SET_RESOLVER_ADMIN']]]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.revocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_SET_RESOLVER_ADMIN'] },
    ])
  })

  // `ROLE_WAS_RESERVED` has no `_ADMIN` variant at all — nobody can revoke it,
  // so it must never be encoded into a bitmap the transfer would send.
  it('treats a role with no admin variant as unrevocable', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_WAS_RESERVED']]]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.revocable).toEqual([])
    expect(plan.unrevocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_WAS_RESERVED'] },
    ])
  })

  // `encodeRoleBitmap` indexes `registryRoles` directly, so anything that isn't
  // one would land in the calldata as `undefined`.
  it('drops a value that does not name a registry role', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_NOT_A_THING']]]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.holders).toEqual([])
  })

  // `_effectiveRoles` ORs the sender's root grant with their per-name one, so
  // a sender whose admin roles sit at the registry root — the usual shape for a
  // name in a registry they own — can revoke a delegate all the same.
  it('counts the sender’s registry-root roles as revoking authority', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_SET_RESOLVER']]]),
      owner: OWNER,
      ownerRoles: [],
      ownerRootRoles: ['ROLE_SET_RESOLVER_ADMIN'],
    })

    expect(plan.revocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
    ])
    expect(plan.unrevocable).toEqual([])
  })

  it('still reports a grant no root role covers as unrevocable', () => {
    const plan = planFor({
      accounts: new Map([[DELEGATE, ['ROLE_UNREGISTER']]]),
      owner: OWNER,
      ownerRoles: [],
      ownerRootRoles: ['ROLE_SET_RESOLVER_ADMIN'],
    })

    expect(plan.revocable).toEqual([])
    expect(plan.unrevocable).toEqual([
      { account: DELEGATE, roles: ['ROLE_UNREGISTER'] },
    ])
  })

  it('drops an account whose grant has already been emptied', () => {
    const plan = planFor({
      accounts: new Map([
        [DELEGATE, []],
        [OTHER, ['ROLE_SET_SUBREGISTRY']],
      ]),
      owner: OWNER,
      ownerRoles: OWNER_ADMIN_ROLES,
    })

    expect(plan.holders).toEqual([
      { account: OTHER, roles: ['ROLE_SET_SUBREGISTRY'] },
    ])
  })
})
