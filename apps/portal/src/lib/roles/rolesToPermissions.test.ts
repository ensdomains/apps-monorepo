import { describe, expect, it } from 'vitest'
import { roleToPermissions } from './rolesToPermissions'

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
