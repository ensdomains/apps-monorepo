import { describe, expect, it } from 'vitest'
import { roleToPermissions } from './rolesToPermissions'

describe('roleToPermissions', () => {
  it('should create manager permission for non-admin role', () => {
    const result = roleToPermissions(['ROLE_RENEW'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: false,
      manager: true,
    })
  })

  it('should create admin permission for role with _ADMIN suffix', () => {
    const result = roleToPermissions(['ROLE_RENEW_ADMIN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: false,
    })
  })

  it('should merge admin and manager permissions for same role', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_RENEW_ADMIN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: true,
    })
  })

  it('should handle multiple different roles', () => {
    const result = roleToPermissions([
      'ROLE_RENEW',
      'ROLE_SET_RESOLVER',
      'ROLE_BURN_ADMIN',
    ])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: false,
      manager: true,
    })
    expect(result.get('ROLE_SET_RESOLVER')).toEqual({
      admin: false,
      manager: true,
    })
    expect(result.get('ROLE_BURN')).toEqual({
      admin: true,
      manager: false,
    })
  })

  it('should handle empty array', () => {
    const result = roleToPermissions([])
    expect(result.size).toBe(0)
  })

  it('should handle only admin roles', () => {
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

  it('should handle only manager roles', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_BURN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: false,
      manager: true,
    })
    expect(result.get('ROLE_BURN')).toEqual({
      admin: false,
      manager: true,
    })
  })

  it('should handle duplicate entries', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_RENEW'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: false,
      manager: true,
    })
    expect(result.size).toBe(1)
  })

  it('should handle admin added before manager', () => {
    const result = roleToPermissions(['ROLE_RENEW_ADMIN', 'ROLE_RENEW'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: true,
    })
  })

  it('should handle manager added before admin', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_RENEW_ADMIN'])

    expect(result.get('ROLE_RENEW')).toEqual({
      admin: true,
      manager: true,
    })
  })

  it('should preserve Map structure for iteration', () => {
    const result = roleToPermissions(['ROLE_RENEW', 'ROLE_BURN_ADMIN'])

    expect(result).toBeInstanceOf(Map)
    expect(Array.from(result.keys())).toEqual(['ROLE_RENEW', 'ROLE_BURN'])
  })
})
