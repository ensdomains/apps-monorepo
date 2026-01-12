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
  it('should return correct permissions for all valid keys', () => {
    const allPermissions = {
      ROLE_RENEW: getPermissionByKey('ROLE_RENEW'),
      ROLE_SET_SUBREGISTRY: getPermissionByKey('ROLE_SET_SUBREGISTRY'),
      ROLE_SET_RESOLVER: getPermissionByKey('ROLE_SET_RESOLVER'),
      ROLE_SET_TOKEN_OBSERVER: getPermissionByKey('ROLE_SET_TOKEN_OBSERVER'),
      ROLE_BURN: getPermissionByKey('ROLE_BURN'),
    }

    expect(allPermissions).toMatchInlineSnapshot(`
      {
        "ROLE_BURN": {
          "description": "Can burn (delete) the name",
          "key": "ROLE_BURN",
          "title": "Burn",
        },
        "ROLE_RENEW": {
          "description": "Can renew name registrations",
          "key": "ROLE_RENEW",
          "title": "Renew",
        },
        "ROLE_SET_RESOLVER": {
          "description": "Can change the resolver addresses",
          "key": "ROLE_SET_RESOLVER",
          "title": "Set Resolver",
        },
        "ROLE_SET_SUBREGISTRY": {
          "description": "Can change subregistry addresses",
          "key": "ROLE_SET_SUBREGISTRY",
          "title": "Set Subregistry",
        },
        "ROLE_SET_TOKEN_OBSERVER": {
          "description": "Can set token observer contracts",
          "key": "ROLE_SET_TOKEN_OBSERVER",
          "title": "Set Token Observer",
        },
      }
    `)
  })

  it('should return undefined for unknown permission key', () => {
    // @ts-expect-error - Testing runtime behavior with invalid key
    const permission = getPermissionByKey('ROLE_UNKNOWN')
    expect(permission).toBeUndefined()
  })
})
