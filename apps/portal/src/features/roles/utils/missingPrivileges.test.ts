import type { Role } from '@ensdomains/ensjs/utils/v2'
import { type Address, getAddress, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getResolverWarning,
  getSubregistryWarning,
  getTransferWarning,
  type TokenRoleHolders,
} from './missingPrivileges'

const OWNER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const SUBREGISTRY: Address = '0xcccccccccccccccccccccccccccccccccccccccc'
const WRAPPER: Address = '0xdddddddddddddddddddddddddddddddddddddddd'

/** What a fresh `.eth` registration grants its owner. */
const ALL_TOKEN_ROLES: Role[] = [
  'ROLE_SET_SUBREGISTRY',
  'ROLE_SET_SUBREGISTRY_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_CAN_TRANSFER_ADMIN',
]

const holders = (
  ...entries: (readonly [Address, Role[]])[]
): TokenRoleHolders => new Map(entries)

const without = (...roles: Role[]) =>
  ALL_TOKEN_ROLES.filter((role) => !roles.includes(role))

describe('getTransferWarning', () => {
  it('warns nothing when the owner is the sole holder of every role', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders([OWNER, ALL_TOKEN_ROLES]),
      }),
    ).toBeNull()
  })

  it('matches the owner regardless of address casing', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders([getAddress(OWNER), ALL_TOKEN_ROLES]),
      }),
    ).toBeNull()
  })

  it('reports cannot-transfer when the owner lacks ROLE_CAN_TRANSFER_ADMIN', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders([OWNER, without('ROLE_CAN_TRANSFER_ADMIN')]),
      }),
    ).toEqual({ kind: 'cannot-transfer' })
  })

  it('reports cannot-transfer when the owner holds no roles at all', () => {
    expect(getTransferWarning({ owner: OWNER, holders: holders() })).toEqual({
      kind: 'cannot-transfer',
    })
  })

  it('reports cannot-transfer-safely when another account holds roles', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders(
          [OWNER, ALL_TOKEN_ROLES],
          [OTHER, ['ROLE_SET_RESOLVER']],
        ),
      }),
    ).toEqual({ kind: 'cannot-transfer-safely' })
  })

  it('prefers cannot-transfer when both apply', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders(
          [OWNER, without('ROLE_CAN_TRANSFER_ADMIN')],
          [OTHER, ['ROLE_SET_RESOLVER']],
        ),
      }),
    ).toEqual({ kind: 'cannot-transfer' })
  })

  it('ignores another account whose roles were all revoked', () => {
    expect(
      getTransferWarning({
        owner: OWNER,
        holders: holders([OWNER, ALL_TOKEN_ROLES], [OTHER, []]),
      }),
    ).toBeNull()
  })
})

describe('getResolverWarning', () => {
  it('warns nothing when the owner holds the admin role', () => {
    expect(
      getResolverWarning({
        owner: OWNER,
        holders: holders([OWNER, ALL_TOKEN_ROLES]),
      }),
    ).toBeNull()
  })

  it('warns nothing when the owner holds only the admin role, which can grant the other', () => {
    expect(
      getResolverWarning({
        owner: OWNER,
        holders: holders([OWNER, without('ROLE_SET_RESOLVER')]),
      }),
    ).toBeNull()
  })

  it('reports locked when the owner holds neither role', () => {
    expect(
      getResolverWarning({
        owner: OWNER,
        holders: holders([
          OWNER,
          without('ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN'),
        ]),
      }),
    ).toEqual({
      kind: 'locked',
      missing: ['ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN'],
    })
  })

  it('reports cannot-grant when the owner lacks only the admin role', () => {
    expect(
      getResolverWarning({
        owner: OWNER,
        holders: holders([OWNER, without('ROLE_SET_RESOLVER_ADMIN')]),
      }),
    ).toEqual({ kind: 'cannot-grant', missing: ['ROLE_SET_RESOLVER_ADMIN'] })
  })

  it("doesn't count another account's roles towards the owner", () => {
    expect(
      getResolverWarning({
        owner: OWNER,
        holders: holders(
          [OWNER, without('ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN')],
          [OTHER, ['ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN']],
        ),
      }),
    ).toMatchObject({ kind: 'locked' })
  })
})

describe('getSubregistryWarning', () => {
  const lockedOwner = holders([
    OWNER,
    without('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN'),
  ])

  it('reports locked when the owner holds neither role', () => {
    expect(
      getSubregistryWarning({
        owner: OWNER,
        holders: lockedOwner,
        subregistry: SUBREGISTRY,
        wrapperRegistry: WRAPPER,
      }),
    ).toEqual({
      kind: 'locked',
      missing: ['ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN'],
    })
  })

  it('reports locked for an empty slot too', () => {
    expect(
      getSubregistryWarning({
        owner: OWNER,
        holders: lockedOwner,
        subregistry: zeroAddress,
        wrapperRegistry: null,
      }),
    ).toMatchObject({ kind: 'locked' })
  })

  it('reports cannot-grant when the owner lacks only the admin role', () => {
    expect(
      getSubregistryWarning({
        owner: OWNER,
        holders: holders([OWNER, without('ROLE_SET_SUBREGISTRY_ADMIN')]),
        subregistry: SUBREGISTRY,
        wrapperRegistry: null,
      }),
    ).toEqual({
      kind: 'cannot-grant',
      missing: ['ROLE_SET_SUBREGISTRY_ADMIN'],
    })
  })

  it('exempts the canonical WrapperRegistry', () => {
    expect(
      getSubregistryWarning({
        owner: OWNER,
        holders: lockedOwner,
        subregistry: getAddress(WRAPPER),
        wrapperRegistry: WRAPPER,
      }),
    ).toBeNull()
  })

  it('warns nothing when the owner holds the admin role', () => {
    expect(
      getSubregistryWarning({
        owner: OWNER,
        holders: holders([OWNER, ALL_TOKEN_ROLES]),
        subregistry: SUBREGISTRY,
        wrapperRegistry: null,
      }),
    ).toBeNull()
  })
})
