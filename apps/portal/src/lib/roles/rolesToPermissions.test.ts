import { describe, expect, it } from 'vitest'
import { hasPermissionsChanged, roleToPermissions } from './rolesToPermissions'

describe('roleToPermissions', () => {
  it('should map manager roles (without _ADMIN suffix)', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_SET_RESOLVER'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: false,
      manager: true,
    })
    expect(result.get('ROLE_SET_RESOLVER')).toEqual({
      admin: false,
      manager: true,
    })
  })

  it('should map admin roles (with _ADMIN suffix)', () => {
    const result = roleToPermissions(['ROLE_RENEW_ADMIN', 'ROLE_BURN_ADMIN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: false,
    })
    expect(result.get('ROLE_BURN')).toEqual({
      admin: true,
      manager: false,
    })
  })

  it('should merge admin and manager for same role', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_RENEW_ADMIN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: true,
    })
  })

  it('should handle empty array', () => {
    expect(roleToPermissions([]).size).toBe(0)
  })
})

describe('hasPermissionsChanged', () => {
  it('should return false when permissions are identical', () => {
    const original = roleToPermissions(['owner_ADMIN', 'owner'])
    const edited = roleToPermissions(['owner_ADMIN', 'owner'])

    expect(hasPermissionsChanged(original, edited)).toBe(false)
  })

  it('should return true when admin permission changed', () => {
    const original = roleToPermissions(['owner_ADMIN'])
    const edited = roleToPermissions([])

    expect(hasPermissionsChanged(original, edited)).toBe(true)
  })

  it('should return true when manager permission added', () => {
    const original = roleToPermissions([])
    const edited = roleToPermissions(['owner'])

    expect(hasPermissionsChanged(original, edited)).toBe(true)
  })

  it('should return true when new role added', () => {
    const original = roleToPermissions(['owner_ADMIN'])
    const edited = roleToPermissions(['owner_ADMIN', 'manager'])

    expect(hasPermissionsChanged(original, edited)).toBe(true)
  })

  it('should return false for empty maps', () => {
    const original = new Map()
    const edited = new Map()

    expect(hasPermissionsChanged(original, edited)).toBe(false)
  })

  it('should return true when edited has fewer roles', () => {
    const original = roleToPermissions(['owner_ADMIN', 'manager'])
    const edited = roleToPermissions(['owner_ADMIN'])

    expect(hasPermissionsChanged(original, edited)).toBe(true)
  })
})
