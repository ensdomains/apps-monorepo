import { describe, expect, it } from 'vitest'
import { getPermissionByKey, permissions } from './permissions'

describe('permissions', () => {
  it('should have 5 permissions defined', () => {
    expect(permissions).toHaveLength(5)
  })

  it('should contain all expected permissions', () => {
    const keys = permissions.map((p) => p.key)
    expect(keys).toEqual([
      'ROLE_RENEW',
      'ROLE_SET_SUBREGISTRY',
      'ROLE_SET_RESOLVER',
      'ROLE_SET_TOKEN_OBSERVER',
      'ROLE_BURN',
    ])
  })

  it('should have title and description for each permission', () => {
    for (const permission of permissions) {
      expect(permission.key).toBeTruthy()
      expect(permission.title).toBeTruthy()
      expect(permission.description).toBeTruthy()
    }
  })
})

describe('getPermissionByKey', () => {
  it('should return permission for ROLE_RENEW', () => {
    const permission = getPermissionByKey('ROLE_RENEW')
    expect(permission).toEqual({
      key: 'ROLE_RENEW',
      title: 'Renew',
      description: 'Can renew name registrations',
    })
  })

  it('should return permission for ROLE_SET_SUBREGISTRY', () => {
    const permission = getPermissionByKey('ROLE_SET_SUBREGISTRY')
    expect(permission).toEqual({
      key: 'ROLE_SET_SUBREGISTRY',
      title: 'Set Subregistry',
      description: 'Can change subregistry addresses',
    })
  })

  it('should return permission for ROLE_SET_RESOLVER', () => {
    const permission = getPermissionByKey('ROLE_SET_RESOLVER')
    expect(permission).toEqual({
      key: 'ROLE_SET_RESOLVER',
      title: 'Set Resolver',
      description: 'Can change the resolver addresses',
    })
  })

  it('should return permission for ROLE_SET_TOKEN_OBSERVER', () => {
    const permission = getPermissionByKey('ROLE_SET_TOKEN_OBSERVER')
    expect(permission).toEqual({
      key: 'ROLE_SET_TOKEN_OBSERVER',
      title: 'Set Token Observer',
      description: 'Can set token observer contracts',
    })
  })

  it('should return permission for ROLE_BURN', () => {
    const permission = getPermissionByKey('ROLE_BURN')
    expect(permission).toEqual({
      key: 'ROLE_BURN',
      title: 'Burn',
      description: 'Can burn (delete) the name',
    })
  })

  it('should return undefined for unknown permission key', () => {
    // @ts-expect-error - Testing runtime behavior with invalid key
    const permission = getPermissionByKey('ROLE_UNKNOWN')
    expect(permission).toBeUndefined()
  })
})
