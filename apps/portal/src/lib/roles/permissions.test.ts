import { describe, expect, it } from 'vitest'
import { permissions } from './permissions'

describe('permissions', () => {
  it('should match snapshot with all permissions, titles, and descriptions', () => {
    expect(permissions).toMatchInlineSnapshot(`
      [
        {
          "description": "Can renew name registrations",
          "key": "ROLE_RENEW",
          "title": "Renew",
        },
        {
          "description": "Can change subregistry addresses",
          "key": "ROLE_SET_SUBREGISTRY",
          "title": "Set Subregistry",
        },
        {
          "description": "Can change the resolver addresses",
          "key": "ROLE_SET_RESOLVER",
          "title": "Set Resolver",
        },
        {
          "description": "Can set token observer contracts",
          "key": "ROLE_SET_TOKEN_OBSERVER",
          "title": "Set Token Observer",
        },
        {
          "description": "Can burn (delete) the name",
          "key": "ROLE_BURN",
          "title": "Burn",
        },
      ]
    `)
  })
})
