import { computeResolverResource } from '@ensdomains/ensjs/utils/v2'
import { describe, expect, it } from 'vitest'
import {
  describeResolverResource,
  formatSetterScope,
  groupRolesByAccount,
  ROOT_RESOURCE,
  ROOT_RESOURCE_LABEL,
  resolverPermissions,
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
