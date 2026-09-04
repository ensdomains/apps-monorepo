import { encodeFunctionData, keccak256, stringToHex, toHex } from 'viem'
import { describe, expect, it } from 'vitest'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
import {
  ALL_RESOLVER_ROLES,
  computeSetterResource,
  decodeResolverRoleBitmap,
  describeResolverResource,
  encodeResolverRoleBitmap,
  encodeSetterScope,
  groupRolesByAccount,
  ROOT_RESOURCE,
  ROOT_RESOURCE_LABEL,
  resolverRoles,
  setterScopeRole,
} from './resolverRoles'

describe('decodeResolverRoleBitmap', () => {
  it('should decode a single role from bitmap', () => {
    const result = decodeResolverRoleBitmap(resolverRoles.ROLE_LINK)

    expect(result).toEqual(['ROLE_LINK'])
  })

  it('should decode multiple roles from bitmap', () => {
    const bitmap =
      resolverRoles.ROLE_SET_ADDRESS |
      resolverRoles.ROLE_SET_TEXT |
      resolverRoles.ROLE_LINK
    const result = decodeResolverRoleBitmap(bitmap)

    expect(result).toContain('ROLE_SET_ADDRESS')
    expect(result).toContain('ROLE_SET_TEXT')
    expect(result).toContain('ROLE_LINK')
    expect(result).toHaveLength(3)
  })

  it('should decode admin roles from bitmap', () => {
    const bitmap =
      resolverRoles.ROLE_SET_ADDRESS_ADMIN | resolverRoles.ROLE_LINK_ADMIN
    const result = decodeResolverRoleBitmap(bitmap)

    expect(result).toContain('ROLE_SET_ADDRESS_ADMIN')
    expect(result).toContain('ROLE_LINK_ADMIN')
    expect(result).toHaveLength(2)
  })

  it('should decode mixed manager and admin roles', () => {
    const bitmap =
      resolverRoles.ROLE_SET_TEXT |
      resolverRoles.ROLE_SET_TEXT_ADMIN |
      resolverRoles.ROLE_SET_DATA
    const result = decodeResolverRoleBitmap(bitmap)

    expect(result).toContain('ROLE_SET_TEXT')
    expect(result).toContain('ROLE_SET_TEXT_ADMIN')
    expect(result).toContain('ROLE_SET_DATA')
    expect(result).toHaveLength(3)
  })

  it('should handle string bitmap input', () => {
    const bitmap = (
      resolverRoles.ROLE_SET_ADDRESS | resolverRoles.ROLE_SET_NAME
    ).toString()
    const result = decodeResolverRoleBitmap(bitmap)

    expect(result).toContain('ROLE_SET_ADDRESS')
    expect(result).toContain('ROLE_SET_NAME')
  })

  it('should handle hex string bitmap input', () => {
    const bitmap = `0x${(resolverRoles.ROLE_SET_CONTENTHASH | resolverRoles.ROLE_SET_ABI).toString(16)}`
    const result = decodeResolverRoleBitmap(bitmap)

    expect(result).toContain('ROLE_SET_CONTENTHASH')
    expect(result).toContain('ROLE_SET_ABI')
  })

  it('should return empty array for zero bitmap', () => {
    expect(decodeResolverRoleBitmap(0n)).toEqual([])
    expect(decodeResolverRoleBitmap('0')).toEqual([])
    expect(decodeResolverRoleBitmap('0x0')).toEqual([])
  })

  it('should decode ALL_RESOLVER_ROLES into every role and admin', () => {
    const result = decodeResolverRoleBitmap(ALL_RESOLVER_ROLES)

    expect(result.toSorted()).toEqual(Object.keys(resolverRoles).toSorted())
  })

  it('uses the post-audit-2 bit layout (PermissionedResolverLib)', () => {
    expect(resolverRoles.ROLE_SET_ADDRESS).toBe(1n << 0n)
    expect(resolverRoles.ROLE_SET_TEXT).toBe(1n << 4n)
    expect(resolverRoles.ROLE_SET_CONTENTHASH).toBe(1n << 8n)
    expect(resolverRoles.ROLE_SET_ABI).toBe(1n << 12n)
    expect(resolverRoles.ROLE_SET_INTERFACE).toBe(1n << 16n)
    expect(resolverRoles.ROLE_SET_NAME).toBe(1n << 20n)
    expect(resolverRoles.ROLE_SET_DATA).toBe(1n << 24n)
    expect(resolverRoles.ROLE_LINK).toBe(1n << 28n)
    expect(resolverRoles.ROLE_CAN_NAME).toBe(1n << 120n)
    expect(resolverRoles.ROLE_UPGRADE).toBe(1n << 124n)
    expect(resolverRoles.ROLE_LINK_ADMIN).toBe((1n << 28n) << 128n)
  })

  it('round-trips through encodeResolverRoleBitmap', () => {
    const roles = ['ROLE_SET_TEXT', 'ROLE_LINK_ADMIN'] as const
    expect(decodeResolverRoleBitmap(encodeResolverRoleBitmap(roles))).toEqual([
      ...roles,
    ])
  })
})

describe('computeSetterResource', () => {
  it('hashes a uint256 coin type as 32 bytes', () => {
    expect(computeSetterResource({ kind: 'address', coinType: 60n })).toBe(
      BigInt(keccak256(toHex(60n, { size: 32 }))),
    )
  })

  it('hashes a text key as its raw bytes', () => {
    expect(computeSetterResource({ kind: 'text', key: 'avatar' })).toBe(
      BigInt(keccak256(stringToHex('avatar'))),
    )
    expect(computeSetterResource({ kind: 'data', key: 'avatar' })).toBe(
      computeSetterResource({ kind: 'text', key: 'avatar' }),
    )
  })

  it('hashes an interface id as 4 bytes', () => {
    expect(
      computeSetterResource({ kind: 'interface', interfaceId: '0x9061b923' }),
    ).toBe(BigInt(keccak256('0x9061b923')))
  })

  it('never collides with the root resource', () => {
    expect(computeSetterResource({ kind: 'text', key: '' })).not.toBe(
      ROOT_RESOURCE,
    )
  })
})

describe('encodeSetterScope', () => {
  it('encodes setter calldata the contract can decode', () => {
    expect(encodeSetterScope({ kind: 'address', coinType: 60n })).toBe(
      encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setAddress',
        args: ['0x00', 60n, '0x'],
      }),
    )
    expect(encodeSetterScope({ kind: 'text', key: 'avatar' })).toBe(
      encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setText',
        args: ['0x00', 'avatar', ''],
      }),
    )
  })

  it('maps each scope to its setter role', () => {
    expect(setterScopeRole({ kind: 'address', coinType: 60n })).toBe(
      'ROLE_SET_ADDRESS',
    )
    expect(setterScopeRole({ kind: 'text', key: 'x' })).toBe('ROLE_SET_TEXT')
    expect(setterScopeRole({ kind: 'data', key: 'x' })).toBe('ROLE_SET_DATA')
    expect(setterScopeRole({ kind: 'abi', contentType: 1n })).toBe(
      'ROLE_SET_ABI',
    )
    expect(
      setterScopeRole({ kind: 'interface', interfaceId: '0x9061b923' }),
    ).toBe('ROLE_SET_INTERFACE')
  })
})

describe('describeResolverResource', () => {
  it('labels the root resource', () => {
    expect(describeResolverResource(0n)).toBe(ROOT_RESOURCE_LABEL)
    expect(describeResolverResource('0')).toBe(ROOT_RESOURCE_LABEL)
  })

  it('labels well-known setter arguments', () => {
    expect(
      describeResolverResource(
        computeSetterResource({ kind: 'text', key: 'avatar' }),
      ),
    ).toBe('text "avatar"')
    expect(
      describeResolverResource(
        computeSetterResource({ kind: 'address', coinType: 60n }),
      ),
    ).toBe('address (coin type 60)')
  })

  it('falls back to a truncated hash for unknown arguments', () => {
    const resource = computeSetterResource({ kind: 'text', key: 'zzz.unknown' })
    expect(describeResolverResource(resource)).toMatch(
      /^resource 0x[0-9a-f]{8}…/,
    )
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

  it('groups by account and resource, lower-casing the account', () => {
    const avatar = computeSetterResource({ kind: 'text', key: 'avatar' })
    const groups = groupRolesByAccount([
      makeRole(alice, resolverRoles.ROLE_SET_ADDRESS),
      makeRole(alice, resolverRoles.ROLE_SET_TEXT),
      makeRole(alice, resolverRoles.ROLE_SET_TEXT, avatar),
      makeRole(bob, resolverRoles.ROLE_LINK),
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
