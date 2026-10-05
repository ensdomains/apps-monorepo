import { computeResolverResource } from '@ensdomains/ensjs/utils/v2'
import { describe, expect, it } from 'vitest'
import {
  describeResolverResource,
  formatSetterScope,
  groupRolesByAccount,
  planAccountRemoval,
  ROOT_RESOURCE,
  ROOT_RESOURCE_LABEL,
  resolverPermissions,
  resolverRoleGroupId,
  UNREADABLE_RESOURCE_LABEL,
} from './resolverRoles'

// The bit layout, resources and setter encodings are ensjs's and are covered
// there. These cover what the portal adds: labelling and grouping.

describe('resolverPermissions', () => {
  it('lists only grantable (non-admin) roles', () => {
    expect(resolverPermissions.every((p) => !p.key.endsWith('_ADMIN'))).toBe(
      true,
    )
  })

  it('has no duplicate keys', () => {
    const keys = resolverPermissions.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('describeResolverResource', () => {
  it('labels the root resource', () => {
    expect(describeResolverResource(ROOT_RESOURCE)).toBe(ROOT_RESOURCE_LABEL)
    expect(describeResolverResource('0')).toBe(ROOT_RESOURCE_LABEL)
  })

  it('labels well-known setter arguments', () => {
    expect(
      describeResolverResource(
        computeResolverResource({ kind: 'text', key: 'avatar' }),
      ),
    ).toBe('text "avatar"')
    expect(
      describeResolverResource(
        computeResolverResource({ kind: 'address', coinType: 60n }),
      ),
    ).toBe('address (coin type 60)')
  })

  it('falls back to a truncated hash for unknown arguments', () => {
    expect(
      describeResolverResource(
        computeResolverResource({ kind: 'text', key: 'zzz.unknown' }),
      ),
    ).toMatch(/^resource 0x[0-9a-f]{8}…/)
  })
})

describe('formatSetterScope', () => {
  it('renders every scope kind', () => {
    expect(formatSetterScope({ kind: 'data', key: 'x' })).toBe('data "x"')
    expect(formatSetterScope({ kind: 'abi', contentType: 1n })).toBe(
      'ABI (content type 1)',
    )
    expect(
      formatSetterScope({ kind: 'interface', interfaceId: '0x9061b923' }),
    ).toBe('interface 0x9061b923')
  })
})

const makeRole = (account: string, bitmap: bigint, resource = 0n) => ({
  account,
  resource: resource.toString(),
  roleBitmap: bitmap.toString(),
})

describe('groupRolesByAccount', () => {
  const alice = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const bob = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })

  it('groups by account and resource, lower-casing the account', () => {
    const groups = groupRolesByAccount([
      makeRole(alice, 1n << 0n),
      makeRole(alice, 1n << 4n),
      makeRole(alice, 1n << 4n, avatar),
      makeRole(bob, 1n << 28n),
    ])

    expect(groups).toHaveLength(3)

    const aliceRoot = groups.find(
      (g) => g.account === alice.toLowerCase() && g.isRoot,
    )
    expect(aliceRoot?.decodedRoles).toEqual([
      'ROLE_SET_ADDRESS',
      'ROLE_SET_TEXT',
    ])
    expect(aliceRoot?.resourceLabel).toBe(ROOT_RESOURCE_LABEL)

    const aliceAvatar = groups.find(
      (g) => g.account === alice.toLowerCase() && !g.isRoot,
    )
    expect(aliceAvatar?.resource).toBe(avatar.toString())
    expect(aliceAvatar?.resourceLabel).toBe('text "avatar"')
    expect(aliceAvatar?.decodedRoles).toEqual(['ROLE_SET_TEXT'])

    expect(groups.find((g) => g.account === bob)?.decodedRoles).toEqual([
      'ROLE_LINK',
    ])
  })

  it('returns an empty array for no roles', () => {
    expect(groupRolesByAccount([])).toEqual([])
  })
})

describe('groupRolesByAccount with a malformed resource', () => {
  it('keeps the row apart from the account root grant, with no resource', () => {
    const account = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const groups = groupRolesByAccount([
      makeRole(account, 1n << 0n),
      { account, resource: 'not-a-number', roleBitmap: (1n << 4n).toString() },
    ])

    // The genuine root grant must not have absorbed the malformed row's role:
    // revoking it would otherwise target root.
    const root = groups.find((group) => group.isRoot)
    expect(root?.decodedRoles).toEqual(['ROLE_SET_ADDRESS'])

    // The malformed row is still listed, so the operator can see the grant
    // exists, but it carries no resource for anything to be written against.
    const unreadable = groups.find((group) => group.resourceId === null)
    expect(unreadable?.isRoot).toBe(false)
    expect(unreadable?.resourceLabel).toBe(UNREADABLE_RESOURCE_LABEL)
    expect(unreadable?.decodedRoles).toEqual(['ROLE_SET_TEXT'])
    expect(groups).toHaveLength(2)
  })
})

describe('resolverRoleGroupId', () => {
  it('identifies a row by account and resource, not by position', () => {
    const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })
    const account = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

    expect(resolverRoleGroupId({ account, resource: '0' })).toBe(
      `${account.toLowerCase()}:0`,
    )
    expect(
      resolverRoleGroupId({ account, resource: avatar.toString() }),
    ).not.toBe(resolverRoleGroupId({ account, resource: '0' }))
  })
})

// Immunefi #92605 / #92820: "Remove user" issued one scoped revoke while the
// dialog promised removal from every role, so a root grant survived.
describe('planAccountRemoval', () => {
  const alice = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const bob = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })
  const eth = computeResolverResource({ kind: 'address', coinType: 60n })

  it('revokes every resource the account holds, root first', () => {
    const plan = planAccountRemoval(
      [
        makeRole(alice, 1n << 4n, avatar),
        makeRole(alice, 1n << 0n, eth),
        makeRole(alice, 1n << 0n),
        makeRole(bob, 1n << 0n),
      ],
      alice.toLowerCase(),
    )

    expect(plan).toEqual({
      type: 'complete',
      revocations: [
        {
          resource: ROOT_RESOURCE,
          resourceLabel: ROOT_RESOURCE_LABEL,
          roles: ['ROLE_SET_ADDRESS'],
        },
        {
          resource: avatar,
          resourceLabel: 'text "avatar"',
          roles: ['ROLE_SET_TEXT'],
        },
        {
          resource: eth,
          resourceLabel: 'address (coin type 60)',
          roles: ['ROLE_SET_ADDRESS'],
        },
      ],
    })
  })

  it("leaves other accounts' grants alone", () => {
    const plan = planAccountRemoval(
      [makeRole(alice, 1n << 0n), makeRole(bob, 1n << 28n, avatar)],
      alice,
    )

    expect(plan.type === 'complete' && plan.revocations).toEqual([
      {
        resource: ROOT_RESOURCE,
        resourceLabel: ROOT_RESOURCE_LABEL,
        roles: ['ROLE_SET_ADDRESS'],
      },
    ])
  })

  it('refuses a full removal when one of the grants cannot be read', () => {
    const plan = planAccountRemoval(
      [
        makeRole(alice, 1n << 0n),
        {
          account: alice,
          resource: 'not-a-number',
          roleBitmap: (1n << 4n).toString(),
        },
      ],
      alice,
    )

    expect(plan).toEqual({ type: 'unreadable' })
  })
})
