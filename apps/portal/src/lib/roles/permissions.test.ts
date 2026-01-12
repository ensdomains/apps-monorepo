import { describe, expect, it } from 'vitest'
import { permissions } from './permissions'

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
